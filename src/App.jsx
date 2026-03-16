import React, { useState, useEffect, useRef } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import Tesseract from 'tesseract.js';

export default function App() {
  const [step, setStep] = useState(1);
  const [people, setPeople] = useState([]);
  const [currentName, setCurrentName] = useState('');
  
  // OCR and items
  const [isScanning, setIsScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  
  // Validation step inputs
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [parsedQty, setParsedQty] = useState(1);
  const [previewUnitPrice, setPreviewUnitPrice] = useState(0);

  // Tip / propina
  const [tipPercentage, setTipPercentage] = useState(10);
  const [customTip, setCustomTip] = useState('');

  // Modal for asking quantity
  const [showQuantityModal, setShowQuantityModal] = useState(false);
  const [modalItemId, setModalItemId] = useState(null);
  const [modalPersonId, setModalPersonId] = useState(null);
  const [modalQuantity, setModalQuantity] = useState(1);

  // OCR Worker Optimization
  const workerRef = useRef(null);
  const [ocrProgress, setOcrProgress] = useState('Procesando imagen...');

  useEffect(() => {
    const initWorker = async () => {
      try {
        const worker = await Tesseract.createWorker('spa', 1, {
          logger: m => {
            if (m.status === 'recognizing text') {
              setOcrProgress(`Analizando... ${(m.progress * 100).toFixed(0)}%`);
            } else {
              setOcrProgress('Cargando motor de IA...');
            }
          }
        });
        workerRef.current = worker;
      } catch (e) {
        console.error("Error initializing Tesseract worker", e);
      }
    };
    initWorker();

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  // ---------- STEP 1: Add People ----------
  const handleAddPerson = () => {
    if (currentName.trim()) {
      setPeople([...people, { id: Date.now().toString(), name: currentName.trim() }]);
      setCurrentName('');
    }
  };

  const handleRemovePerson = (id) => {
    // Optional: remove person from item assignments as well
    setPeople(people.filter((p) => p.id !== id));
    setScannedItems(scannedItems.map(item => ({
      ...item,
      consumers: item.consumers.filter(consumerId => consumerId !== id)
    })));
  };

  // ---------- STEP 2: Camera & OCR ----------
  const takePicture = async () => {
    try {
      const image = await Camera.getPhoto({
        quality: 90,
        allowEditing: true, // Let user crop to the receipt
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Prompt // Ask: Camera or Gallery
      });

      if (image && image.dataUrl) {
        performOCR(image.dataUrl);
      }
    } catch (error) {
      console.error("Camera error:", error);
    }
  };

  const performOCR = async (imageBuffer) => {
    setIsScanning(true);
    setStep(3); // Move to scanning view

    try {
      let result;
      if (workerRef.current) {
        // Use pre-loaded fast worker
        result = await workerRef.current.recognize(imageBuffer);
      } else {
        // Fallback if not ready
        setOcrProgress('Iniciando IA local...');
        result = await Tesseract.recognize(imageBuffer, 'spa');
      }
      
      const lines = result.data.lines.map(l => l.text.trim());
      parseReceiptText(lines);
    } catch (error) {
      console.error("OCR Error:", error);
      alert("Hubo un error escaneando la boleta.");
    } finally {
      setIsScanning(false);
      setOcrProgress('Procesando imagen...');
    }
  };

  const parseReceiptText = (lines) => {
    const extractedList = [];
    
    // Very basic heuristic: Look for lines that look like a price at the end
    // E.g. "8 Mojave 45000" or "Mojito $ 45.000"
    const priceRegex = /[\$\s]*(?:\d+[.,]?\d*)+$/;
    
    // Quantity heuristic: Look for a number followed by 'x', 'X' or space at the start of the item name
    const qtyRegex = /^(\d+)\s*[xX*]?\s+/;

    lines.forEach((line) => {
      // Clean typical OCR noise
      const cleanLine = line.replace(/\|/g, '').trim(); 
      if (!cleanLine) return;

      const match = cleanLine.match(priceRegex);
      if (match) {
        const priceStr = match[0].replace(/[^\d]/g, ''); // strip everything except digits
        const price = parseInt(priceStr, 10);
        
        // Ensure it's a reasonable price parsing
        if (price > 0 && priceStr.length > 2) { 
          let rawName = cleanLine.replace(priceRegex, '').trim();
          
          let qty = 1;
          const qtyMatch = rawName.match(qtyRegex);
          if (qtyMatch) {
            qty = parseInt(qtyMatch[1], 10) || 1;
            rawName = rawName.replace(qtyRegex, '').trim();
          }

          if (rawName.length > 2) {
            extractedList.push({
              id: Date.now() + Math.random().toString(),
              name: rawName,
              qty: qty,
              price: price,
              unitPrice: qty > 1 ? price / qty : price,
              consumers: [], // Array of person IDs
              consumerCounts: {} // number of units consumed per person
            });
          }
        }
      }
    });

    setScannedItems(extractedList);
  };

  const skipOCR = () => {
    setStep(3);
    setScannedItems([]);
  };

  // ---------- STEP 3: Validate Items ----------
  const handleNameChange = (value) => {
    setNewItemName(value);
    // Parse quantity from name
    let qty = 1;
    const qtyMatch = value.match(/^(\d+)\s*[xX*]?\s+/);
    if (qtyMatch) {
      qty = parseInt(qtyMatch[1], 10) || 1;
    }
    setParsedQty(qty);
    // Recalculate unit price if price is set
    if (newItemPrice) {
      const totalPrice = parseFloat(newItemPrice);
      setPreviewUnitPrice(qty > 1 ? totalPrice / qty : totalPrice);
    }
  };

  const handlePriceChange = (value) => {
    setNewItemPrice(value);
    const totalPrice = parseFloat(value) || 0;
    setPreviewUnitPrice(totalPrice / parsedQty);
  };

  const handleAddItem = () => {
    if (newItemName.trim() && parseFloat(newItemPrice) > 0) {
      // Parse manual quantity if they write "2x Bebidas"
      let qty = 1;
      let name = newItemName.trim();
      const qtyMatch = name.match(/^(\d+)\s*[xX*]?\s+/);
      if (qtyMatch) {
        qty = parseInt(qtyMatch[1], 10) || 1;
        name = name.replace(/^(\d+)\s*[xX*]?\s+/, '').trim();
      }

      const totalPrice = parseFloat(newItemPrice);
      const unitPrice = totalPrice / qty;

      setScannedItems([...scannedItems, {
        id: Date.now().toString(),
        name: name,
        qty: qty,
        price: totalPrice,
        unitPrice: unitPrice,
        consumers: [],
        consumerCounts: {}
      }]);
      setNewItemName('');
      setNewItemPrice('');
      setParsedQty(1);
      setPreviewUnitPrice(0);
    }
  };

  const handleRemoveItem = (id) => {
    setScannedItems(scannedItems.filter(i => i.id !== id));
  };


  // ---------- STEP 4: Assignment ----------
  const setConsumerCount = (itemId, personId, count) => {
    setScannedItems(scannedItems.map(item => {
      if (item.id !== itemId) return item;

      const existingCounts = { ...(item.consumerCounts || {}) };
      const oldCount = existingCounts[personId] ?? 0;

      // Clamp to min/max based on remaining quantity
      const totalAssigned = Object.values(existingCounts).reduce((sum, v) => sum + v, 0);
      const remaining = item.qty - (totalAssigned - oldCount);
      const clamped = Math.max(1, Math.min(remaining, count));

      if (clamped <= 0) {
        delete existingCounts[personId];
      } else {
        existingCounts[personId] = clamped;
      }

      // Keep consumer list in sync with counts
      const newConsumers = Object.keys(existingCounts);
      return { ...item, consumers: newConsumers, consumerCounts: existingCounts };
    }));
  };

  const toggleConsumer = (itemId, personId) => {
    setScannedItems(scannedItems.map(item => {
      if (item.id !== itemId) return item;

      const counts = { ...(item.consumerCounts || {}) };
      const totalAssigned = Object.values(counts).reduce((sum, v) => sum + v, 0);

      if (counts[personId]) {
        delete counts[personId];
      } else {
        // Only allow selecting another person if there are remaining units
        if (totalAssigned >= item.qty) return item;

        const maxAllowed = item.qty - totalAssigned;

        // Ask how many units this person consumed (only when quantity > 1)
        if (item.qty > 1) {
          // Show modal instead of prompt
          setModalItemId(itemId);
          setModalPersonId(personId);
          setModalQuantity(1); // default
          setShowQuantityModal(true);
          return item; // Don't update yet, wait for modal
        } else {
          counts[personId] = 1;
        }
      }

      const newConsumers = Object.keys(counts);
      return { ...item, consumers: newConsumers, consumerCounts: counts };
    }));
  };

  const confirmQuantityModal = () => {
    if (!modalItemId || !modalPersonId) return;

    const item = scannedItems.find(i => i.id === modalItemId);
    if (!item) return;

    const counts = { ...(item.consumerCounts || {}) };
    const totalAssigned = Object.values(counts).reduce((sum, v) => sum + v, 0);
    const maxAllowed = item.qty - totalAssigned;
    const count = Math.max(1, Math.min(maxAllowed, modalQuantity));

    counts[modalPersonId] = count;
    const newConsumers = Object.keys(counts);

    setScannedItems(scannedItems.map(i =>
      i.id === modalItemId ? { ...i, consumers: newConsumers, consumerCounts: counts } : i
    ));

    setShowQuantityModal(false);
    setModalItemId(null);
    setModalPersonId(null);
  };
  

  // ---------- Calculation ----------
  const calculateFinalResults = () => {
    let totalBill = scannedItems.reduce((acc, item) => acc + item.price, 0);
    
    // Calculate tip
    let tipAmount = 0;
    if (tipPercentage === 'custom') {
      tipAmount = parseFloat(customTip) || 0;
    } else {
      tipAmount = totalBill * (tipPercentage / 100);
    }

    // Initialize all debts to 0
    let debts = {};
    people.forEach(p => {
      debts[p.id] = { name: p.name, baseShare: 0, personTip: 0, totalToPay: 0 };
    });

    // Subtotal of prices assigned to people (vs unassigned noise)
    let assignedTotal = 0;

    scannedItems.forEach(item => {
      const unitPrice = item.unitPrice ?? (item.qty > 0 ? item.price / item.qty : item.price);
      const hasCounts = item.consumerCounts && Object.keys(item.consumerCounts).length > 0;
      const counts = hasCounts ? item.consumerCounts : item.consumers.reduce((acc, id) => ({ ...acc, [id]: 1 }), {});
      const sumCounts = Object.values(counts).reduce((sum, v) => sum + v, 0);

      if (sumCounts > 0) {
        // Prevent assigning more than the total quantity
        const scale = sumCounts > item.qty ? item.qty / sumCounts : 1;
        const assignedUnits = sumCounts * scale;
        const assignedAmount = unitPrice * assignedUnits;
        assignedTotal += assignedAmount;

        Object.entries(counts).forEach(([personId, count]) => {
          if (debts[personId]) {
            debts[personId].baseShare += unitPrice * count * scale;
          }
        });
      }
    });

    // Unassigned amount (noise/mistakes not assigned) mapped equally to everyone
    const unassigned = Math.max(0, totalBill - assignedTotal);
    const equalShare = people.length > 0 ? unassigned / people.length : 0;
    
    // Apply Equal Share and Proportional Tip
     return Object.values(debts).map(p => {
      p.baseShare += equalShare;
      
      // Proportional tip based on base share
      p.personTip = totalBill > 0 ? (p.baseShare / totalBill) * tipAmount : 0;
      p.totalToPay = p.baseShare + p.personTip;
      
      return p;
    });
  };

  // ================= RENDERERS ================= //

  const renderStep1 = () => (
    <div className="step-container">
      <h1 className="title">¿Quiénes están en la mesa?</h1>
      <p className="subtitle">Ingresa a todos para dividir la cuenta después.</p>
      
      <div className="row">
        <input
          className="std-input flex-1"
          type="text"
          value={currentName}
          onChange={(e) => setCurrentName(e.target.value)}
          placeholder="Nombre de la persona"
          onKeyDown={(e) => e.key === 'Enter' && handleAddPerson()}
        />
        <button className="small-button" onClick={handleAddPerson}>
          Agregar
        </button>
      </div>
      
      <div className="list-container flex-1">
        {people.map((person) => (
          <div key={person.id} className="person-card">
            <span className="person-name">{person.name}</span>
            <button className="icon-button danger" onClick={() => handleRemovePerson(person.id)}>✕</button>
          </div>
        ))}
      </div>

      <button 
        className="primary-button" 
        disabled={people.length < 1}
        onClick={() => setStep(2)}>
        Siguiente
      </button>
    </div>
  );

  const renderStep2 = () => (
    <div className="step-container" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
      <h1 className="title">Escanear Boleta</h1>
      <p className="subtitle" style={{marginBottom: '40px'}}>
        Toma una foto a la boleta. La aplicación intentará extraer todos los productos.
      </p>

      <div style={{ padding: '30px', backgroundColor: 'var(--card)', borderRadius: '15px', border: '1px dashed var(--primary)', marginBottom: '40px' }}>
        <h1 style={{ fontSize: '60px'}}>📸</h1>
      </div>

      <button className="primary-button" onClick={takePicture}>
        Tomar Foto o Subir
      </button>

      <button className="outline-button margin-top-20" onClick={skipOCR}>
        Ingresar Todo Manualmente
      </button>
    </div>
  );

  const renderStep3 = () => (
    <div className="step-container">
      <h1 className="title">Validar Productos</h1>
      
      {isScanning ? (
        <div className="flex-center-all loading-box">
           <h1 className="scanning-icon">🔍</h1>
           <p style={{ marginTop: '20px', fontSize: '18px'}}>{ocrProgress}</p>
           <p className="subtitle" style={{marginTop:'10px'}}>Por favor, espera unos segundos.</p>
        </div>
      ) : (
        <>
          <p className="subtitle">
            Agrega lo que falte o borra productos erróneos que la cámara leyó mal.
          </p>

          <div className="row" style={{ gap: '10px' }}>
            <input
              className="std-input"
              style={{ flex: 2 }}
              type="text"
              value={newItemName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="Ej: 6 Mojitos"
            />
            <input
              className="std-input"
              style={{ flex: 1 }}
              type="number"
              value={newItemPrice}
              onChange={(e) => handlePriceChange(e.target.value)}
              placeholder="$ Precio total"
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            />
            <button className="small-button" style={{ marginLeft: 0}} onClick={handleAddItem}>+</button>
          </div>
          {newItemPrice && (
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '5px', marginBottom: '10px' }}>
              Precio unitario: ${previewUnitPrice.toFixed(0)} c/u
            </p>
          )}

          <div className="list-container flex-1">
            {scannedItems.length === 0 && (
              <p style={{textAlign: 'center', color: 'var(--text-secondary)', padding: '20px'}}>No hay productos.</p>
            )}
            {scannedItems.map((item) => (
              <div key={item.id} className="consumption-card">
                <div>
                  <span className="person-name">{item.qty > 1 ? `${item.qty}x ` : ''}{item.name}</span>
                  <br/>
                  <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>${item.price.toFixed(0)} total</span>
                  <span style={{color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '10px'}}>
                    (${item.unitPrice.toFixed(0)} c/u)
                  </span>
                </div>
                <button className="icon-button danger" onClick={() => handleRemoveItem(item.id)}>✕</button>
              </div>
            ))}
          </div>

          <div className="summary-card">
            <p><strong>Total de boleta:</strong> ${scannedItems.reduce((a, b) => a + b.price, 0).toFixed(0)}</p>
          </div>

          <button 
            className="primary-button" 
            disabled={scannedItems.length === 0}
            onClick={() => setStep(4)}>
            Confirmar e ir a Asignar
          </button>
        </>
      )}
    </div>
  );



  const renderStep4 = () => {
    return (
      <div className="step-container">
        <h1 className="title">Asignar Consumo</h1>
        <p className="subtitle">Selecciona a una persona para registrar cuántas unidades consumió.</p>

        <div className="list-container flex-1">
          {scannedItems.length === 0 ? (
            <p style={{textAlign: 'center', color: 'var(--text-secondary)', padding: '20px'}}>No hay productos para asignar.</p>
          ) : (
            scannedItems.map((item) => {
              const totalAssigned = Object.values(item.consumerCounts || {}).reduce((sum, v) => sum + v, 0);
              const remaining = Math.max(0, item.qty - totalAssigned);

              return (
                <div key={item.id} className="consumption-card">
                  <div style={{ flex: 1 }}>
                    <span className="person-name">{item.qty > 1 ? `${item.qty}x ` : ''}{item.name}</span>
                    <br />
                    <span style={{color: 'var(--primary)', fontWeight: 'bold'}}>${item.price.toFixed(0)} total</span>
                    {item.qty > 1 && (
                      <span style={{color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '10px'}}>
                        (${ (item.unitPrice ?? (item.price / item.qty)).toFixed(0) } c/u)
                      </span>
                    )}
                    <div style={{marginTop: '8px', fontSize: '12px', color: 'var(--text-secondary)'}}>
                      Asignado: {totalAssigned} / {item.qty} {remaining > 0 ? `(${remaining} restantes)` : '(completo)'}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '12px' }}>
                    {people.map((person) => {
                      const count = item.consumerCounts?.[person.id] ?? 0;
                      const isActive = count > 0;
                      return (
                        <button
                          key={person.id}
                          className={`person-badge ${isActive ? 'active' : ''}`}
                          onClick={() => toggleConsumer(item.id, person.id)}
                          style={{ minWidth: '90px' }}
                        >
                          {person.name} {isActive ? `(${count})` : ''}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>

        <button
          className="primary-button"
          disabled={scannedItems.length === 0}
          onClick={() => setStep(5)}
        >
          Siguiente
        </button>

        {showQuantityModal && (() => {
          const item = scannedItems.find(i => i.id === modalItemId);
          const person = people.find(p => p.id === modalPersonId);
          const totalAssigned = item ? Object.values(item.consumerCounts || {}).reduce((sum, v) => sum + v, 0) : 0;
          const maxAllowed = item ? Math.max(1, item.qty - totalAssigned) : 1;

          return (
            <div className="modal-overlay">
              <div className="modal-content">
                <h2>¿Cuántos {item?.name ?? 'items'} consumió {person?.name ?? 'esta persona'}?</h2>
                <p>Máx {maxAllowed}</p>

                <input
                  type="number"
                  min={1}
                  max={maxAllowed}
                  value={modalQuantity}
                  onChange={(e) => setModalQuantity(Number(e.target.value))}
                  className="std-input"
                  style={{ marginTop: '10px' }}
                />

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                  <button
                    className="outline-button"
                    onClick={() => {
                      setShowQuantityModal(false);
                      setModalItemId(null);
                      setModalPersonId(null);
                    }}
                  >
                    Cancelar
                  </button>
                  <button className="primary-button" onClick={confirmQuantityModal}>
                    Guardar
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    );
  };

  const renderStep5 = () => (
    <div className="step-container">
      <h1 className="title">¿Cuánta propina dejarán?</h1>
      
      <div className="tip-options">
        {[10, 15, 20].map((tip) => (
          <button 
            key={tip} 
            className={`tip-button ${tipPercentage === tip ? 'active' : ''}`}
            onClick={() => { setTipPercentage(tip); setCustomTip(''); }}
          >
            {tip}%
          </button>
        ))}
        <button 
            className={`tip-button ${tipPercentage === 'custom' ? 'active' : ''}`}
            onClick={() => setTipPercentage('custom')}
          >
            Otro
        </button>
      </div>

      {tipPercentage === 'custom' && (
         <div className="input-group-standard margin-top-20">
           <span className="currency-symbol-small">$</span>
           <input
             className="std-input"
             type="number"
             value={customTip}
             onChange={(e) => setCustomTip(e.target.value)}
             placeholder="Monto total de propina"
           />
         </div>
      )}

      <button className="primary-button margin-top-auto" onClick={() => setStep(6)}>
        Calcular División
      </button>
    </div>
  );

  const renderStep6 = () => {
    const results = calculateFinalResults();
    const totalBill = scannedItems.reduce((acc, item) => acc + item.price, 0);
    const totalTip = results.reduce((acc, p) => acc + p.personTip, 0);
    const totalFinal = totalBill + totalTip;

    return (
      <div className="step-container">
        <h1 className="title">Resumen de la Cuenta</h1>
        
        <div className="final-summary-card">
          <div className="split-row">
            <span>Cuenta Base:</span>
            <span>${totalBill.toFixed(0)}</span>
          </div>
          <div className="split-row">
            <span>Propina:</span>
            <span>${totalTip.toFixed(0)}</span>
          </div>
          <div className="split-row total-row">
            <span>Total Final:</span>
            <span>${totalFinal.toFixed(0)}</span>
          </div>
        </div>

        <div className="list-container flex-1">
          {results.map((person, i) => (
            <div key={i} className="result-card">
              <div className="result-header">
                <span className="result-name">{person.name}</span>
                <span className="result-amount">${person.totalToPay.toFixed(0)}</span>
              </div>
              <div className="result-detail">Consumo + Compartido: ${person.baseShare.toFixed(0)}</div>
              <div className="result-detail">Propina: ${person.personTip.toFixed(0)}</div>
            </div>
          ))}
        </div>

        <button 
          className="outline-button" 
          onClick={() => {
            setStep(1);
            setPeople([]);
            setCurrentName('');
            setScannedItems([]);
            setTipPercentage(10);
            setCustomTip('');
          }}>
          Volver a empezar
        </button>
      </div>
    );
  };

  return (
    <div className="app-layout">
      <header className="header">
        <h1 className="header-brand">PagoJusto</h1>
        {step > 1 && step < 6 && (
          <button className="back-button" onClick={() => setStep(step === 3 && scannedItems.length > 0 && !isScanning ? 3 : step - 1)}>
            ← Volver
          </button>
        )}
      </header>

      <main className="content">
        {step === 1 && renderStep1()}
        {step === 2 && renderStep2()}
        {step === 3 && renderStep3()}
        {step === 4 && renderStep4()}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
      </main>
    </div>
  );
}

