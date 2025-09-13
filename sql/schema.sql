
USE invoice_db;

-- users
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- clients
CREATE TABLE IF NOT EXISTS clients (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  motor_vehicle_no VARCHAR(50),
  gst VARCHAR(50),
  phone VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- products (unique 8-digit HSN)
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  hsn_sac CHAR(8) UNIQUE NOT NULL,
  default_bag_qty INT DEFAULT 50,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_no VARCHAR(50) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  client_id INT NOT NULL,
  date_generated DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  motor_vehicle_no VARCHAR(50),
  delivery_address TEXT,
  total_amount DECIMAL(15,2),
  discount_percent DECIMAL(7,2) DEFAULT 0,
  discount_amount DECIMAL(15,2) DEFAULT 0,
  grand_total DECIMAL(15,2),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

-- invoice items
CREATE TABLE IF NOT EXISTS invoice_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  description TEXT,
  hsn_sac CHAR(8) NOT NULL,
  num_bags INT,
  bag_qty INT,
  quantity_kg DECIMAL(12,2),
  rate_per_bag DECIMAL(12,2),
  rate_per_kg DECIMAL(12,2),
  discount_percent DECIMAL(6,2) DEFAULT 0,
  gst_percent DECIMAL(6,2) DEFAULT 0,
  amount DECIMAL(15,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

-- invoice counter row for atomic increments
CREATE TABLE IF NOT EXISTS invoice_counter (
  id INT PRIMARY KEY,
  prefix VARCHAR(10) DEFAULT 'IB',
  next_no INT DEFAULT 101
);

INSERT IGNORE INTO invoice_counter (id, prefix, next_no) VALUES (1, 'IB', 101);
