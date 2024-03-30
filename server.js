const express = require("express");
const bodyParser = require("body-parser");
const mysql = require("mysql2/promise"); // Updated import
const bcrypt = require("bcrypt");
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const port = 5001;

app.use(bodyParser.json());
app.use(cors());

// Create MySQL connection pool
const pool = mysql.createPool({
  host: "localhost",
  user: "root",
  password: "9701386393",
  database: "food_app",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Secret key for JWT
const jwtSecretKey = "your_jwt_secret_key";

// Helper function to generate JWT token
function generateToken(userId) {
  return jwt.sign({ userId }, jwtSecretKey, { expiresIn: "1h" });
}

// Helper function to verify JWT token
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, jwtSecretKey);
    return decoded.userId;
  } catch (error) {
    return null;
  }
}

// API endpoints

// Signup
app.post("/signup", async (req, res) => {
  const { username, email, password } = req.body;
  try {
    const connection = await pool.getConnection();
    try {
      const [existingUser] = await connection.execute(
        "SELECT * FROM Users WHERE email = ?",
        [email]
      );
      if (existingUser.length > 0) {
        return res.status(400).json({ error: "Email already registered" });
      }
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.execute(
        "INSERT INTO Users (username, email, password_hash) VALUES (?, ?, ?)",
        [username, email, hashedPassword]
      );
      res.json({ message: "User created successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Login
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  try {
    const connection = await pool.getConnection();
    try {
      const [user] = await connection.execute(
        "SELECT * FROM Users WHERE email = ?",
        [email]
      );
      if (user.length === 0) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const passwordMatch = await bcrypt.compare(
        password,
        user[0].password_hash
      );
      if (!passwordMatch) {
        return res.status(401).json({ error: "Invalid email or password" });
      }
      const token = generateToken(user[0].user_id);
      res.json({ token });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all food items
app.get("/foods", async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      const [foods] = await connection.execute("SELECT * FROM Foods");
      res.json(foods);
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get food items by category
app.get("/foods/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await pool.getConnection();
    try {
      const [foods] = await connection.execute(
        "SELECT * FROM Foods WHERE food_id = ?",
        [id]
      );
      res.json(foods);
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add item to user's cart
app.post("/cart", async (req, res) => {
  const { food_id, quantity } = req.body;
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [existingCartItem] = await connection.execute(
        "SELECT * FROM user_cart WHERE user_id = ? AND food_id = ?",
        [userId, food_id]
      );
      if (existingCartItem.length > 0) {
        await connection.execute(
          "UPDATE user_cart SET quantity = ? WHERE user_id = ? AND food_id = ?",
          [existingCartItem[0].quantity + quantity, userId, food_id]
        );
      } else {
        await connection.execute(
          "INSERT INTO user_cart (user_id, food_id, quantity) VALUES (?, ?, ?)",
          [userId, food_id, quantity]
        );
      }
      res.json({ message: "Item added to cart successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place an order
app.post("/orders", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [cartItems] = await connection.execute(
        "SELECT * FROM user_cart WHERE user_id = ?",
        [userId]
      );
      if (cartItems.length === 0) {
        return res.status(400).json({ error: "Cart is empty" });
      }
      let totalAmount = 0;
      for (const item of cartItems) {
        const [food] = await connection.execute(
          "SELECT price FROM Foods WHERE food_id = ?",
          [item.food_id]
        );
        totalAmount += food[0].price * item.quantity;
      }
      await connection.execute(
        "INSERT INTO orders (user_id, total_amount) VALUES (?, ?)",
        [userId, totalAmount]
      );
      await connection.execute("DELETE FROM user_cart WHERE user_id = ?", [
        userId,
      ]);
      res.json({ message: "Order placed successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get user order history
app.get("/orders", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [orders] = await connection.execute(
        "SELECT * FROM orders WHERE user_id = ?",
        [userId]
      );
      res.json(orders);
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/cart", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [cart] = await connection.execute(
        "SELECT foods.name,foods.food_id, foods.description, foods.image_url, foods.price,user_cart.quantity, foods.calories FROM foods LEFT JOIN user_cart ON foods.food_id = user_cart.food_id where user_cart.user_id= ?",
        [userId]
      );
      res.json(cart);
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Increase quantity of item in user's cart
app.patch("/cart/:foodId/increase", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const { foodId } = req.params;
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [existingCartItem] = await connection.execute(
        "SELECT * FROM user_cart WHERE user_id = ? AND food_id = ?",
        [userId, foodId]
      );
      if (!existingCartItem || existingCartItem.length === 0) {
        return res.status(404).json({ error: "Item not found in the cart" });
      }
      await connection.execute(
        "UPDATE user_cart SET quantity = ? WHERE user_id = ? AND food_id = ?",
        [existingCartItem[0].quantity + 1, userId, foodId]
      );
      res.json({ message: "Quantity increased successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Decrease quantity of item in user's cart
app.patch("/cart/:foodId/decrease", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const { foodId } = req.params;
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      const [existingCartItem] = await connection.execute(
        "SELECT * FROM user_cart WHERE user_id = ? AND food_id = ?",
        [userId, foodId]
      );
      if (!existingCartItem || existingCartItem.length === 0) {
        return res.status(404).json({ error: "Item not found in the cart" });
      }
      if (existingCartItem[0].quantity === 1) {
        await connection.execute(
          "DELETE FROM user_cart WHERE user_id = ? AND food_id = ?",
          [userId, foodId]
        );
      } else {
        await connection.execute(
          "UPDATE user_cart SET quantity = ? WHERE user_id = ? AND food_id = ?",
          [existingCartItem[0].quantity - 1, userId, foodId]
        );
      }
      res.json({ message: "Quantity decreased successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Remove item from user's cart
app.delete("/cart/:foodId", async (req, res) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  const { foodId } = req.params;
  const userId = verifyToken(token);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const connection = await pool.getConnection();
    try {
      await connection.execute(
        "DELETE FROM user_cart WHERE user_id = ? AND food_id = ?",
        [userId, foodId]
      );
      res.json({ message: "Item removed from cart successfully" });
    } finally {
      connection.release();
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
