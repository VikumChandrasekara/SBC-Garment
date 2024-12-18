const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const multer = require('multer');
const app = express();

// app.use(express.static(path.join(__dirname, "public")));
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Serve the uploads folder

const port = 5000;

const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "",
    database: "sbc_db"
});


// Connect to MySQL
db.connect(err => {
    if (err) {
        return console.error('error connecting: ' + err.stack);
    }
    console.log('connected as id ' + db.threadId);
});

// Multer storage setup for handling image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Directory to save uploaded images
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // Unique filename to avoid overwriting
    }
});

const upload = multer({ storage }); // Set up multer with the defined storage

app.post('/admin_login', (req, res) => {
    const { admin_name, admin_pw } = req.body;
    
    if (!admin_name || !admin_pw) {
        return res.status(400).json({ error: 'Missing admin_name or admin_pw' });
    }

    const sql = "SELECT * FROM admin_login WHERE admin_name = ? AND admin_pw = ?";
    
    db.query(sql, [admin_name, admin_pw], (err, data) => {
        if (err) {
            console.error('Error during database query: ', err);  // Log the actual error
            return res.status(500).json({ error: 'Database query failed' });
        }
        
        if (data.length > 0) {
            return res.status(200).json({ message: 'Login Successful', data });
        } else {
            return res.status(401).json({ message: 'Invalid credentials' });
        }
    });
});

// Middleware to check if logged in
function isAuthenticated(req, res, next) {
    if (req.session.admin) {
        next();  // Proceed to the next middleware
    } else {
        res.redirect('/my-admin');  // Redirect if not authenticated
    }
}

// Admin dashboard route (protected)
app.get('/my-admin/admindashboard', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'path_to_admin_dashboard_page')); // Serve the admin dashboard
});


// Endpoint to fetch products
app.get('/api/prod_details', (req, res) => {
    db.query('SELECT * FROM prod_details', (error, results) => {
        if (error) throw error;

        
        // Add the full path to the image URL before sending it to the frontend
        const updatedResults = results.map(product => ({
            ...product,
            prod_image: product.prod_image
                ? `${req.protocol}://${req.get('host')}/uploads/${product.prod_image}`
                : null
        }));
        
        res.json(updatedResults);
    });
});

// Endpoint to update products
app.put('/api/update_product/:prod_id', upload.single('prod_image'), (req, res) => {
  const prodId = req.params.prod_id;
  const {
      prod_name,
      prod_qty,
      new_price,
      old_price,
      prod_description,
      category,
      subCategories,
      color_variations,
      other_variations
  } = req.body;

  // Convert subCategories, color_variations, and other_variations to JSON if provided
  const subCategoriesJSON = subCategories ? JSON.stringify(subCategories) : null;
  const colorVariationsJSON = color_variations ? JSON.stringify(color_variations) : null;
  const otherVariationsJSON = other_variations ? JSON.stringify(other_variations) : null;

  let sql = `
      UPDATE prod_details 
      SET prod_name = ?, prod_qty = ?, new_price = ?, old_price = ?, 
          prod_description = ?, category = ?, sub_category = ?, 
          color_variations = ?, other_variations = ?`;
  let values = [
      prod_name,
      prod_qty,
      new_price,
      old_price,
      prod_description,
      category,
      subCategoriesJSON,
      colorVariationsJSON,
      otherVariationsJSON
  ];

  // If an image is uploaded, update the prod_image column
  if (req.file) {
      sql += ', prod_image = ?';
      values.push(req.file.filename);
  }

  sql += ' WHERE prod_id = ?';
  values.push(prodId);

  // Execute the query
  db.query(sql, values, (error, results) => {
      if (error) {
          console.error('Error updating product:', error);
          return res.status(500).json({ error: 'Failed to update product' });
      }
      res.json({ message: 'Product updated successfully' });
  });
});


// Endpoint to add a new product
app.post('/api/add_product', upload.single('prod_image'), (req, res) => {
  const {
      prod_name,
      prod_qty,
      new_price,
      old_price,
      prod_description,
      category,
      subCategories,
      color_variations,
      other_variations
  } = req.body;

  // Convert subCategories, color_variations, and other_variations to JSON if provided
  const subCategoriesJSON = subCategories ? JSON.stringify(subCategories) : null;
  const colorVariationsJSON = color_variations ? JSON.stringify(color_variations) : null;
  const otherVariationsJSON = other_variations ? JSON.stringify(other_variations) : null;

  if (!prod_name || !prod_qty || !new_price || !old_price) {
      console.error('Missing required fields:', { prod_name, prod_qty, new_price, old_price });
      return res.status(400).json({ error: 'Missing required product fields' });
  }

  const sql = `
      INSERT INTO prod_details 
      (prod_name, prod_image, prod_qty, new_price, old_price, prod_description, category, sub_category, color_variations, other_variations)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const values = [
      prod_name,
      req.file ? req.file.filename : null, // Save uploaded image filename if provided
      prod_qty,
      new_price,
      old_price,
      prod_description,
      category,
      subCategoriesJSON,
      colorVariationsJSON,
      otherVariationsJSON
  ];

  // Execute the query
  db.query(sql, values, (error, results) => {
      if (error) {
          console.error('Error adding product:', error);
          return res.status(500).json({ error: 'Failed to add product' });
      }
      res.status(201).json({ message: 'Product added successfully', productId: results.insertId });
  });
});


// Endpoint to delete a product
app.delete('/api/delete_product/:prod_id', (req, res) => {
    const prodId = req.params.prod_id;

    // First, fetch the product to get the image filename
    db.query('SELECT prod_image FROM prod_details WHERE prod_id = ?', [prodId], (err, results) => {
        if (err) return res.status(500).json({ error: 'Database query failed' });
        if (results.length === 0) return res.status(404).json({ error: 'Product not found' });

        const imageFileName = results[0].prod_image;

        // Now delete the product from the database
        db.query('DELETE FROM prod_details WHERE prod_id = ?', [prodId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to delete product' });

            // If an image exists, delete it from the uploads folder
            if (imageFileName) {
                const fs = require('fs');
                const path = require('path');
                const filePath = path.join(__dirname, 'uploads', imageFileName);
                
                fs.unlink(filePath, (err) => {
                    if (err) console.error('Failed to delete image:', err);
                });
            }

            res.json({ message: 'Product deleted successfully' });
        });
    });
});

// Get all coupons
app.get('/api/coupon_details', (req, res) => {
    db.query('SELECT * FROM coupon_details', (error, results) => {
        if (error) return res.status(500).json({ error: 'Database query failed' });
        res.json(results);
    });
});

// Add a new coupon
app.post('/api/coupon_details', (req, res) => {
    console.log('Adding coupon', req.body); // Log the request body to check if it's being sent
    const { coupon_code, coupon_name, discount_percentage } = req.body;
    
    if (!coupon_code || !coupon_name || !discount_percentage) {
      return res.status(400).json({ error: 'Missing coupon details' });
    }
  
    const sql = 'INSERT INTO coupon_details (coupon_code, coupon_name, discount_percentage) VALUES (?, ?, ?)';
    db.query(sql, [coupon_code, coupon_name, discount_percentage], (err, results) => {
      if (err) {
        console.error('Error inserting coupon:', err);
        return res.status(500).json({ error: 'Database query failed' });
      }
      res.json({ message: 'Coupon added successfully', coupon_id: results.insertId });
    });
  });
  
// Endpoint to apply coupon
app.post('/api/apply_coupon', (req, res) => {
    const { coupon_code } = req.body;

    if (!coupon_code) {
        return res.status(400).json({ error: 'Coupon code is required' });
    }

    const sql = 'SELECT * FROM coupon_details WHERE coupon_code = ?';
    db.query(sql, [coupon_code], (err, results) => {
        if (err) {
            return res.status(500).json({ error: 'Database query failed' });
        }

        if (results.length > 0) {
            const coupon = results[0];
            // Return the discount percentage if valid
            res.json({
                success: true,
                coupon_name: coupon.coupon_name,
                discount_percentage: coupon.discount_percentage
            });
        } else {
            // Coupon not found
            res.status(404).json({ success: false, message: 'Invalid coupon code' });
        }
    });
});

// Update a coupon
app.put('/api/update_coupon/:coupon_id', (req, res) => {
    const { coupon_id } = req.params;
    const { coupon_name, coupon_code, discount_percentage } = req.body;

    const sql = 'UPDATE coupon_details SET coupon_name = ?, coupon_code = ?, discount_percentage = ? WHERE coupon_id = ?';
    const values = [coupon_name, coupon_code, discount_percentage, coupon_id];

    db.query(sql, values, (error, results) => {
        if (error) {
            console.error('Error updating coupon:', error);
            return res.status(500).json({ error: 'Failed to update coupon' });
        }
        res.json({ message: 'Coupon updated successfully', affectedRows: results.affectedRows });
    });
});

// Delete a coupon
app.delete('/api/delete_coupon/:coupon_id', (req, res) => {
    const { coupon_id } = req.params;

    db.query('DELETE FROM coupon_details WHERE coupon_id = ?', [coupon_id], (error, results) => {
        if (error) {
            return res.status(500).json({ error: 'Failed to delete coupon' });
        }
        res.json({ message: 'Coupon deleted successfully', affectedRows: results.affectedRows });
    });
});
  
// Function to generate unique Order ID based on the current date
const generateOrderID = () => {
    const date = new Date();
    const orderDate = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    return new Promise((resolve, reject) => {
      // Get the number of orders for today
      db.query(`SELECT COUNT(*) AS orderCount FROM order_details WHERE DATE(orderDate) = ?`, [orderDate], (err, result) => {
        if (err) reject(err);
        const orderCount = result[0].orderCount + 1;
        const orderID = `${orderDate}-${String(orderCount).padStart(3, '0')}`; // Format: YYYY-MM-DD-001
        resolve(orderID);
      });
    });
  };
  
  // Endpoint to place an order
  app.post('/api/place_order', async (req, res) => {
    const { firstName, lastName, contactNumber, address1, address2, city, province, postalCode, specialNote, subtotal, deliveryFee, discount, total } = req.body;
  
    try {
      // Generate unique order ID
      const orderID = await generateOrderID();
  
      // Save order details to MySQL
      const query = `
        INSERT INTO order_details (
          orderID, firstName, lastName, contactNumber, address1, address2, city, province, postalCode, specialNote, subtotal, deliveryFee, discount, total
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;
      
      const params = [
        orderID,
        firstName,
        lastName,
        contactNumber,
        address1,
        address2,
        city,
        province,
        postalCode,
        specialNote || null,
        subtotal,
        deliveryFee,
        discount,
        total
      ];
  
      db.query(query, params, (err, result) => {
        if (err) {
          res.status(500).json({ error: 'Failed to place order' });
          console.error(err);
        } else {
          res.status(200).json({ message: 'Order placed successfully', orderID });
        }
      });
    } catch (err) {
      res.status(500).json({ error: 'Error generating Order ID' });
      console.error(err);
    }
  });
  

  // Endpoint to get all order details
  app.get('/api/order_details', (req, res) => {
    const query = 'SELECT * FROM order_details';
  
    db.query(query, (err, result) => {
      if (err) {
        res.status(500).json({ error: 'Failed to fetch order details' });
        console.error(err);
      } else {
        res.status(200).json(result); // Send back all order details
      }
    });
  });

  app.put('/api/order_details/:orderID', async (req, res) => {
    const { orderID } = req.params;  // The orderID is a string, so treat it accordingly
    const { order_status } = req.body;  // New order status
  
    // Log the orderID and status to ensure they're being received correctly
    console.log('Received orderID:', orderID); 
    console.log('New status:', order_status);
  
    // Validate order_status
    const validStatuses = ['Pending', 'Processing', 'Completed'];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({ message: 'Invalid order status' });
    }
  
    try {
      // Perform the update query
      const [rows, fields] = await db.query(
        'UPDATE order_details SET order_status = ? WHERE orderID = ?',
        [order_status, orderID]  // Ensure orderID is passed as a string
      );
  
      // Check if any rows were affected (meaning the order was updated)
      if (rows.affectedRows > 0) {
        return res.status(200).send({ message: 'Order status updated successfully' });
      } else {
        return res.status(404).json({ message: 'Order not found' });
      }
    } catch (err) {
      console.error('Error during query execution:', err); // Log the error for debugging
      return res.status(500).json({ message: 'Error updating order status' });
    }
  });
  
// Search API route
app.get('/api/search', (req, res) => {
    const { q } = req.query; // Get search query from request
  
    // If the query is missing, send a 400 Bad Request error
    if (!q) {
      return res.status(400).send('Bad Request: Missing search query');
    }
  
    // Parameterized SQL query to prevent SQL injection
    const sql = `
        SELECT prod_id, prod_name, prod_image, prod_qty, new_price, old_price FROM prod_details WHERE prod_name LIKE ? 
    `;
  
    // Execute the SQL query with parameters to safely pass user input
    db.query(sql, [`%${q}%`, `%${q}%`], (err, results) => {
      if (err) {
        console.error('SQL query error:', err.message);  // Log the SQL error
        return res.status(500).send('Internal Server Error: ' + err.message); // Send a detailed error message
      }
  
      if (results.length === 0) {
        return res.status(404).send('No results found for "' + q + '"');
      }
  
      // Return the results as JSON
      res.json(results);
    });
  });
  
  app.get('/api/products', async (req, res) => {
    const { category, sub_category } = req.query;
    
    try {
      // If sub_category is not provided, we only filter by category
      let query = 'SELECT * FROM prod_details WHERE category = ?';
      let queryParams = [category];
  
      // If sub_category is provided, add it to the query
      if (sub_category) {
        query += ' AND sub_category = ?';
        queryParams.push(sub_category);
      }
  
      // Execute the query
      db.query(query, queryParams, (err, rows) => {
        if (err) {
          return res.status(500).json({ error: 'Internal Server Error', details: err.message });
        }
        res.json(rows);
      });
    } catch (err) {
      res.status(500).json({ error: 'Internal Server Error', details: err.message });
    }
  });
  
  
// Start the server on port 5000
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
  
// Start the server
app.listen(port, () => console.log(`Server running on port ${port}`));
