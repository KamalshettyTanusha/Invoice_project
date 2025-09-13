const express = require('express');
const router = express.Router();
const pool = require('../db');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function authMiddleware(req, res, next){
  const auth = req.headers.authorization;
  if(!auth) return res.status(401).json({ error: 'No token' });
  const token = auth.split(' ')[1];
  try { req.user = jwt.verify(token, JWT_SECRET); next(); }
  catch(e) { return res.status(401).json({ error: 'Invalid token' }); }
}

// helper to compute amount for an item
function computeItemAmount(it){
  const numBags = Number(it.num_bags || 0);
  const bagQty = Number(it.bag_qty || 50);
  const qtyKg = numBags * bagQty;
  let amount = 0;
  if(it.rate_per_bag) amount = Number(it.rate_per_bag) * numBags;
  else amount = (Number(it.rate_per_kg) || 0) * qtyKg;
  return { qtyKg, amount };
}

// create invoice (atomic invoice counter increment)
router.post('/', authMiddleware, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // pull and lock counter
    const [ctrRows] = await connection.query('SELECT * FROM invoice_counter WHERE id = 1 FOR UPDATE');
    if(!ctrRows.length) throw new Error('Invoice counter not initialized');
    const counter = ctrRows[0];
    const invoiceNo = `${counter.prefix}${String(counter.next_no).padStart(5,'0')}`; // e.g. IB00101 -> pad to 5 digits (adjust as needed)
    await connection.query('UPDATE invoice_counter SET next_no = next_no + 1 WHERE id = 1');

    // client handling (create if client_id not passed)
    let clientId = req.body.client_id;
    if(!clientId){
      const c = req.body.client;
      const [cr] = await connection.query('INSERT INTO clients (name, address, motor_vehicle_no, gst, phone) VALUES (?, ?, ?, ?, ?)', [c.name, c.address, c.motor_vehicle_no, c.gst, c.phone]);
      clientId = cr.insertId;
    }

    // insert invoice placeholder
    const { motor_vehicle_no, delivery_address, notes, discount_percent = 0 } = req.body;
    const [invRes] = await connection.query(
      'INSERT INTO invoices (invoice_no, user_id, client_id, motor_vehicle_no, delivery_address, total_amount, discount_percent, discount_amount, grand_total, notes) VALUES (?, ?, ?, ?, ?, 0, ?, 0, 0, ?)',
      [invoiceNo, req.user.id, clientId, motor_vehicle_no, delivery_address, discount_percent, notes || null]
    );
    const invoiceId = invRes.insertId;

    // process each item
    let totalAmount = 0;
    for(const it of req.body.items || []){
      // ensure product exists by name or id
      let productId = it.product_id || null;
      let hsn = it.hsn_sac || null;
      if(!productId){
        // check by name
        const [pRows] = await connection.query('SELECT * FROM products WHERE name = ?', [it.name]);
        if(pRows.length){
          productId = pRows[0].id;
          hsn = pRows[0].hsn_sac;
        } else {
          // create product with new 8-digit hsn
          let candidate = String(Math.floor(10000000 + Math.random() * 90000000));
          while(true){
            const [cchk] = await connection.query('SELECT id FROM products WHERE hsn_sac = ?', [candidate]);
            if(cchk.length === 0) break;
            candidate = String(Math.floor(10000000 + Math.random() * 90000000));
          }
          const [pr] = await connection.query('INSERT INTO products (name, hsn_sac, default_bag_qty) VALUES (?, ?, ?)', [it.name, candidate, it.bag_qty || 50]);
          productId = pr.insertId;
          hsn = candidate;
        }
      }

      const { qtyKg, amount } = computeItemAmount(it);
      totalAmount += amount;

      await connection.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, hsn_sac, num_bags, bag_qty, quantity_kg, rate_per_bag, rate_per_kg, discount_percent, gst_percent, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [invoiceId, productId, it.description || it.name, hsn, it.num_bags || 0, it.bag_qty || 50, qtyKg, it.rate_per_bag || null, it.rate_per_kg || null, it.discount_percent || 0, it.gst_percent || 0, amount]
      );
    }

    const discountAmount = (totalAmount * (Number(discount_percent) || 0)) / 100;
    const grandTotal = totalAmount - discountAmount;

    await connection.query('UPDATE invoices SET total_amount = ?, discount_amount = ?, grand_total = ? WHERE id = ?', [totalAmount, discountAmount, grandTotal, invoiceId]);

    await connection.commit();

    // return created invoice summary
    const [invRows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
    res.json({ invoice: invRows[0], message: 'Invoice created' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// get invoice with items
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    const [invRows] = await pool.query('SELECT * FROM invoices WHERE id = ?', [id]);
    if(!invRows.length) return res.status(404).json({ error: 'Invoice not found' });
    const invoice = invRows[0];
    const [items] = await pool.query('SELECT * FROM invoice_items WHERE invoice_id = ?', [id]);
    res.json({ invoice, items });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// optional: update invoice (save as new or overwrite) — here we show an overwrite PUT
router.put('/:id', authMiddleware, async (req, res) => {
  // For brevity, this simply recomputes totals and updates records.
  // In production, you might want to version invoices instead of overwriting.
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const id = req.params.id;
    const { items, discount_percent = 0, motor_vehicle_no, delivery_address, notes } = req.body;

    // simple: delete existing items
    await connection.query('DELETE FROM invoice_items WHERE invoice_id = ?', [id]);

    let totalAmount = 0;
    for(const it of items || []){
      // ensure product exists
      let productId = it.product_id;
      let hsn = it.hsn_sac;
      if(!productId){
        const [pRows] = await connection.query('SELECT * FROM products WHERE name = ?', [it.name]);
        if(pRows.length) { productId = pRows[0].id; hsn = pRows[0].hsn_sac;}
        else {
          let candidate = String(Math.floor(10000000 + Math.random() * 90000000));
          while(true){
            const [cchk] = await connection.query('SELECT id FROM products WHERE hsn_sac = ?', [candidate]);
            if(cchk.length === 0) break;
            candidate = String(Math.floor(10000000 + Math.random() * 90000000));
          }
          const [pr] = await connection.query('INSERT INTO products (name, hsn_sac, default_bag_qty) VALUES (?, ?, ?)', [it.name, candidate, it.bag_qty || 50]);
          productId = pr.insertId; hsn = candidate;
        }
      }
      const qtyKg = Number(it.num_bags || 0) * Number(it.bag_qty || 50);
      const amount = it.rate_per_bag ? (Number(it.rate_per_bag) * Number(it.num_bags || 0)) : (Number(it.rate_per_kg || 0) * qtyKg);
      totalAmount += amount;
      await connection.query(
        `INSERT INTO invoice_items (invoice_id, product_id, description, hsn_sac, num_bags, bag_qty, quantity_kg, rate_per_bag, rate_per_kg, discount_percent, gst_percent, amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
         [id, productId, it.description || it.name, hsn, it.num_bags || 0, it.bag_qty || 50, qtyKg, it.rate_per_bag || null, it.rate_per_kg || null, it.discount_percent || 0, it.gst_percent || 0, amount]
      );
    }

    const discountAmount = (totalAmount * (Number(discount_percent) || 0)) / 100;
    const grandTotal = totalAmount - discountAmount;
    await connection.query('UPDATE invoices SET motor_vehicle_no = ?, delivery_address = ?, total_amount = ?, discount_percent = ?, discount_amount = ?, grand_total = ?, notes = ? WHERE id = ?', [motor_vehicle_no, delivery_address, totalAmount, discount_percent, discountAmount, grandTotal, notes || null, id]);

    await connection.commit();
    res.json({ message: 'Invoice updated' });
  } catch (err) {
    await connection.rollback();
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    connection.release();
  }
});

module.exports = router;
