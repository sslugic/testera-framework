import http from 'node:http';

export function createDemoServer(port = 3333): http.Server {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url || '/', `http://localhost:${port}`);

    if (url.pathname === '/api/checkout' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ orderId: 'LUNA-9823', status: 'confirmed' }));
      return;
    }

    // Main demo page
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Luna Store - Autonomous UI Demo</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #1e293b; margin: 0; padding: 2rem; }
    .nav { display: flex; justify-content: space-between; align-items: center; background: #fff; padding: 1rem 2rem; border-radius: 0.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); margin-bottom: 2rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1.5rem; }
    .card { background: #fff; border-radius: 0.5rem; padding: 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .btn { background: #6366f1; color: #fff; border: none; padding: 0.6rem 1.2rem; border-radius: 0.375rem; font-weight: 600; cursor: pointer; }
    .btn:hover { background: #4f46e5; }
    .badge { background: #e0e7ff; color: #4338ca; padding: 0.25rem 0.6rem; border-radius: 9999px; font-weight: bold; }
    /* Intentional a11y bug for critic: tiny button */
    .tiny-btn { width: 18px; height: 18px; font-size: 10px; background: #cbd5e1; border: none; cursor: pointer; }
    .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); align-items: center; justify-content: center; }
    .modal.open { display: flex; }
    .modal-content { background: #fff; padding: 2rem; border-radius: 0.75rem; width: 100%; max-width: 440px; }
    .form-group { margin-bottom: 1rem; }
    .form-group label { display: block; margin-bottom: 0.35rem; font-weight: 500; font-size: 0.9rem; }
    .form-group input { width: 100%; padding: 0.5rem; border: 1px solid #cbd5e1; border-radius: 0.375rem; box-sizing: border-box; }
    .success-banner { display: none; background: #dcfce7; border: 1px solid #86efac; color: #166534; padding: 1.5rem; border-radius: 0.5rem; text-align: center; margin-top: 2rem; }
  </style>
</head>
<body>
  <nav class="nav">
    <h2>Luna Store</h2>
    <div>
      <a href="#catalog" style="margin-right: 1.5rem; text-decoration: none; color: #475569;">Catalog</a>
      <button id="cart-btn" class="btn" onclick="openCart()">
        Cart (<span id="cart-count">0</span>)
      </button>
      <!-- Tiny button intentionally below WCAG 24x24 minimum -->
      <button class="tiny-btn" title="Info">?</button>
    </div>
  </nav>

  <main class="grid">
    <div class="card">
      <h3>Luna Wireless Pro Headphones</h3>
      <p style="color: #64748b; margin: 0.5rem 0 1rem;">Noise-cancelling, 40h battery, spatial audio.</p>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: bold; font-size: 1.25rem;">$199.00</span>
        <button class="btn add-to-cart-btn" data-testid="add-headphones" onclick="addToCart('Luna Wireless Pro')">
          Add to Cart
        </button>
      </div>
    </div>

    <div class="card">
      <h3>Tactile Mechanical Keyboard</h3>
      <p style="color: #64748b; margin: 0.5rem 0 1rem;">Hot-swappable switches, RGB backlight.</p>
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="font-weight: bold; font-size: 1.25rem;">$149.00</span>
        <button class="btn add-to-cart-btn" data-testid="add-keyboard" onclick="addToCart('Mechanical Keyboard')">
          Add to Cart
        </button>
      </div>
    </div>
  </main>

  <!-- Checkout Drawer / Modal -->
  <div id="checkout-modal" class="modal">
    <div class="modal-content">
      <h3 style="margin-bottom: 1rem;">Checkout & Shipping</h3>
      <div class="form-group">
        <label for="cust-name">Full Name</label>
        <input id="cust-name" type="text" placeholder="John Doe" required />
      </div>
      <div class="form-group">
        <label for="cust-email">Email Address</label>
        <input id="cust-email" type="email" placeholder="john@example.com" required />
      </div>
      <div class="form-group">
        <label for="cust-address">Shipping Address</label>
        <input id="cust-address" type="text" placeholder="123 Market St" required />
      </div>
      <!-- Intentionally unlabeled input to test Usability Critic -->
      <div class="form-group">
        <input id="unlabeled-promo" type="text" placeholder="Promo code (optional)" />
      </div>
      <div style="display: flex; gap: 1rem; margin-top: 1.5rem;">
        <button class="btn" style="flex: 1;" onclick="submitOrder()">Place Order</button>
        <button style="background: #e2e8f0; border: none; padding: 0.6rem 1rem; border-radius: 0.375rem; cursor: pointer;" onclick="closeCart()">Cancel</button>
      </div>
    </div>
  </div>

  <div id="confirmation-banner" class="success-banner">
    <h2>🎉 Order Placed Successfully!</h2>
    <p>Thank you for shopping with Luna. Your order <strong>#LUNA-8492</strong> has been confirmed.</p>
  </div>

  <script>
    let cart = 0;
    function addToCart(item) {
      cart++;
      document.getElementById('cart-count').innerText = cart;
      console.log('Added to cart:', item);
    }
    function openCart() {
      document.getElementById('checkout-modal').classList.add('open');
    }
    function closeCart() {
      document.getElementById('checkout-modal').classList.remove('open');
    }
    function submitOrder() {
      closeCart();
      document.getElementById('confirmation-banner').style.display = 'block';
      console.log('Order submitted successfully!');
    }
  </script>
</body>
</html>`);
  });

  return server;
}

if (process.argv[1]?.endsWith('demo-server.ts')) {
  const port = 3333;
  const srv = createDemoServer(port);
  srv.listen(port, () => {
    console.log(`Demo web app running on http://localhost:${port}`);
  });
}
