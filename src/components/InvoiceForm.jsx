import React, { useState, useRef } from 'react';
import api from '../api';
import InvoicePreview from './InvoicePreview';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function InvoiceForm(){
  const [clientQuery, setClientQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [client, setClient] = useState({ id: null, name:'', address:'', motor_vehicle_no:'', gst:'', phone:'' });
  const [items, setItems] = useState([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [savedInvoice, setSavedInvoice] = useState(null);
  const previewRef = useRef();

  async function searchClients(q){
    if(!q) { setSuggestions([]); return; }
    try {
      const res = await api.get(`/clients/search?q=${encodeURIComponent(q)}`);
      setSuggestions(res.data || []);
    } catch(err) {
      console.error(err);
    }
  }

  function selectSuggestion(s){
    setClient({
      id: s.id,
      name: s.name,
      address: s.address,
      motor_vehicle_no: s.motor_vehicle_no,
      gst: s.gst,
      phone: s.phone
    });
    setClientQuery(s.name);
    setSuggestions([]);
  }

  function addItem(){
    setItems([...items, { name:'', description:'', num_bags:0, bag_qty:50, rate_per_bag:0, rate_per_kg:0, discount_percent:0, gst_percent:0 }]);
  }
  function updateItem(i, patch){
    const copy = [...items];
    copy[i] = {...copy[i], ...patch};
    setItems(copy);
  }
  function removeItem(i){
    const copy = [...items];
    copy.splice(i,1);
    setItems(copy);
  }

  function computeTotals(){
    let total = 0;
    for(const it of items){
      const numBags = Number(it.num_bags || 0);
      const bagQty = Number(it.bag_qty || 50);
      const qtyKg = numBags * bagQty;
      const amount = it.rate_per_bag ? (Number(it.rate_per_bag) * numBags) : (Number(it.rate_per_kg || 0) * qtyKg);
      total += amount;
    }
    const discount = (total * (Number(discountPercent) || 0))/100;
    const grand = total - discount;
    return { total, discount, grand };
  }

  async function saveInvoice(){
    try {
      const payload = {
        client_id: client.id,
        client: client.id ? undefined : {
          name: client.name,
          address: client.address,
          motor_vehicle_no: client.motor_vehicle_no,
          gst: client.gst,
          phone: client.phone
        },
        items,
        discount_percent: discountPercent,
        motor_vehicle_no: client.motor_vehicle_no,
        delivery_address: client.address,
        notes: ''
      };
      const res = await api.post('/invoices', payload);
      setSavedInvoice(res.data.invoice);
      alert('Saved. Invoice no: ' + res.data.invoice.invoice_no);
    } catch(err){
      alert(err?.response?.data?.error || err.message);
      console.error(err);
    }
  }

  async function generatePDF(){
    // ensure previewRef is current DOM node
    const input = previewRef.current;
    if(!input) { alert('Preview not ready'); return; }
    // scale can be higher for better quality
    const canvas = await html2canvas(input, { scale: 2 });
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    const now = new Date();
    const fname = `${savedInvoice?.invoice_no || 'Invoice'}_${now.toISOString().slice(0,19).replace(/[:T]/g,'-')}.pdf`;
    pdf.save(fname);
  }

  const totals = computeTotals();

  return (
    <div>
      <div className="card">
        <h3>Client Details</h3>
        <div className="row">
          <div style={{flex:1}}>
            <input placeholder="Search client name or address" value={clientQuery}
              onChange={e=>{ setClientQuery(e.target.value); searchClients(e.target.value); }} />
            {suggestions.length > 0 && (
              <div className="suggestions">
                {suggestions.map(s => (
                  <div key={s.id} className="suggestion" onClick={()=>selectSuggestion(s)}>
                    <strong>{s.name}</strong><div style={{fontSize:12}}>{s.address}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{flex:1}}>
            <input placeholder="Client name" value={client.name} onChange={e=>setClient({...client, name:e.target.value})} />
            <input placeholder="Motor vehicle no." value={client.motor_vehicle_no} onChange={e=>setClient({...client, motor_vehicle_no:e.target.value})} />
          </div>
          <div style={{flex:2}}>
            <textarea placeholder="Address" value={client.address} onChange={e=>setClient({...client, address:e.target.value})} />
          </div>
        </div>
      </div>

      <div className="card">
        <h3>Items</h3>
        <button onClick={addItem}>+ Add Item</button>
        {items.map((it, idx) => {
          const qtyKg = Number(it.num_bags || 0) * Number(it.bag_qty || 50);
          const amount = it.rate_per_bag ? (Number(it.rate_per_bag) * Number(it.num_bags || 0)) : (Number(it.rate_per_kg || 0) * qtyKg);
          return (
            <div key={idx} className="item-row">
              <input placeholder="Product name" value={it.name} onChange={e=>updateItem(idx, { name: e.target.value })} />
              <input placeholder="No of Bags" type="number" value={it.num_bags} onChange={e=>updateItem(idx, { num_bags: e.target.value })} />
              <input placeholder="Bag qty (kg)" type="number" value={it.bag_qty} onChange={e=>updateItem(idx, { bag_qty: e.target.value })} />
              <input placeholder="Rate per bag" type="number" value={it.rate_per_bag} onChange={e=>updateItem(idx, { rate_per_bag: e.target.value })} />
              <input placeholder="Rate per kg" type="number" value={it.rate_per_kg} onChange={e=>updateItem(idx, { rate_per_kg: e.target.value })} />
              <div style={{minWidth:120}}>
                Qty(kg): {qtyKg} <br/> Amount: {amount?.toFixed?.(2) || '0.00'}
              </div>
              <button onClick={()=>removeItem(idx)}>Remove</button>
            </div>
          );
        })}
        <div className="row" style={{alignItems:'center', marginTop:10}}>
          <div style={{flex:1}}>
            <label>Discount % (invoice-level)</label>
            <input type="number" value={discountPercent} onChange={e=>setDiscountPercent(e.target.value)} />
          </div>
          <div style={{flex:1, textAlign:'right'}}>
            <div>Total: {totals.total.toFixed(2)}</div>
            <div>Discount: {totals.discount.toFixed(2)}</div>
            <div><strong>Grand: {totals.grand.toFixed(2)}</strong></div>
          </div>
        </div>

        <div style={{marginTop:12}}>
          <button onClick={saveInvoice}>Save Invoice (store in DB & assign invoice no)</button>
          <button onClick={generatePDF} style={{marginLeft:8}}>Generate & Download PDF</button>
        </div>
      </div>

      <div className="card" style={{marginTop:18}}>
        <h3>Invoice Preview</h3>
        <div ref={previewRef}>
          <InvoicePreview client={client} items={items} totals={totals} discountPercent={discountPercent} invoiceMeta={savedInvoice} />
        </div>
      </div>
    </div>
  );
}

export default InvoiceForm;
