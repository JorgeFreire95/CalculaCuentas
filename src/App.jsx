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

      const unitPrice = parseFloat(newItemPrice);
      const totalPrice = qty > 1 ? unitPrice * qty : unitPrice;

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
    setScannedItems(scannedItems.map(item => {
      if (item.id === itemId) {
        // Distribute units among people: 1 each round-robin until we run out
        const counts = {};
        let remaining = item.qty;

        // First, give 1 unit to as many people as possible (up to qty)
        people.forEach((p) => {
          if (remaining > 0) {
            counts[p.id] = 1;
            remaining -= 1;
          }
        });

        // If we still have remaining units, keep distributing round-robin
        let idx = 0;
        while (remaining > 0 && people.length > 0) {
          const person = people[idx % people.length];
          counts[person.id] = (counts[person.id] || 0) + 1;
          remaining -= 1;
          idx += 1;
        }

        return { ...item, consumers: Object.keys(counts), consumerCounts: counts };
      }
      return item;
    }));
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
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Ej: 2 Bebidas"
            />
            <input
              className="std-input"
              style={{ flex: 1 }}
              type="number"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="$ Precio"
              onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
            />
            <button className="small-button" style={{ marginLeft: 0}} onClick={handleAddItem}>+</button>
          </div>

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
                  {item.qty > 1 && (
                    <span style={{color: 'var(--text-secondary)', fontSize: '12px', marginLeft: '10px'}}>
                      (${ (item.unitPrice ?? (item.price / item.qty)).toFixed(0) } c/u)
                    </span>
                  )}
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
        <h1 className="header-brand">CalculaCuentas</h1>
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
        {step === 4 && <div>Step 4</div>}
        {step === 5 && renderStep5()}
        {step === 6 && renderStep6()}
      </main>
    </div>
  );
  g

