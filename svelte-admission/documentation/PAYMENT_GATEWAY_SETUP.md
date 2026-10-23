# Payment Gateway Setup & Developer Guide 

This guide provides instructions for developers on setting up and integrating payment gateways (specifically **Razorpay** and **PayU**) into the University Admission System.

---

## 1. Razorpay Integration

### 1.1. Account Setup (Test Mode)
1.  **Sign Up:** Go to [Razorpay Dashboard](https://dashboard.razorpay.com/signup) and create an account.
2.  **Activate Test Mode:** Once logged in, switch the toggle at the top right to **Test Mode**.
3.  **Generate API Keys:**
    *   Navigate to **Settings** > **API Keys**.
    *   Click **Generate Key**.
    *   Copy the `Key ID` and `Key Secret`. *Store the Secret securely; it is shown only once.*

### 1.2. Configuration in Application
1.  Log in to the **Admin Dashboard** of the Admission System.
2.  Navigate to **System Settings** > **Payment Gateways**.
3.  Click **Add Gateway**.
4.  **Provider Name:** Select `Razorpay`.
5.  **Display Name:** E.g., `Credit/Debit/UPI (Razorpay)`.
6.  **Mode:** Select `Test`.
7.  **Configuration JSON:** Paste the following JSON, replacing the placeholders with your keys:
    ```json
    {
      "key_id": "YOUR_RAZORPAY_KEY_ID",
      "key_secret": "YOUR_RAZORPAY_KEY_SECRET",
      "webhook_secret": "OPTIONAL_WEBHOOK_SECRET"
    }
    ```
8.  Toggle **Active** and click **Save**.

### 1.3. Developer Integration Details
*   **Backend (`src/lib/server/payment.ts`):** The `createPaymentOrder` function currently mocks the order creation. For Razorpay, you need to install the `razorpay` npm package:
    ```bash
    npm install razorpay
    ```
    Then update the function to use the SDK:
    ```typescript
    import Razorpay from 'razorpay';

    // Inside createPaymentOrder...
    const razorpay = new Razorpay({
        key_id: gateway.config.key_id,
        key_secret: gateway.config.key_secret
    });

    const order = await razorpay.orders.create({
        amount: request.amount * 100, // Amount in paise
        currency: request.currency,
        receipt: transaction.id,
        notes: request.metadata
    });

    return { 
        orderId: order.id, 
        // ...
    };
    ```
*   **Frontend:** Use the `Razorpay` script in `index.html` or load dynamically.
    ```html
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
    ```

---

## 2. PayU Integration

### 2.1. Account Setup (Sandbox)
1.  **Register:** Sign up at [PayU Hub](https://register.payu.in/).
2.  **Access Credentials:** Go to the **Merchant Dashboard**.
3.  Locate your `Merchant Key` (Salt) and `Merchant ID` (MID).

### 2.2. Configuration in Application
1.  Go to **Admin Dashboard** > **Payment Gateways**.
2.  Add a new gateway with **Provider Name**: `PayU`.
3.  **Configuration JSON:**
    ```json
    {
      "merchant_key": "YOUR_MERCHANT_KEY",
      "merchant_salt": "YOUR_MERCHANT_SALT",
      "base_url": "https://test.payu.in/_payment" 
    }
    ```
    *(Note: Use `https://secure.payu.in/_payment` for Production)*.

### 2.3. Developer Integration Details
*   **Hashing:** PayU requires a specific hash sequence (`key|txnid|amount|productinfo|firstname|email|udf1...|salt`).
*   **Backend:** Implement a hash generation helper in `src/lib/server/payment.ts`.
    ```typescript
    import crypto from 'crypto';

    function generatePayUHash(params, salt) {
        const hashString = `${params.key}|${params.txnid}|${params.amount}|${params.productinfo}|${params.firstname}|${params.email}|||||||||||${salt}`;
        return crypto.createHash('sha512').update(hashString).digest('hex');
    }
    ```
*   **Form Submission:** PayU uses a standard HTML Form POST redirection rather than a JS popup. The backend should return the `hash` and parameters, and the frontend should auto-submit a hidden form to the `base_url`.

---

## 3. Webhooks & Security

### 3.1. Webhook Setup
Webhooks ensure the system updates the payment status even if the user closes the browser immediately after payment.

*   **Razorpay:**
    1.  Go to **Settings** > **Webhooks** in the Razorpay Dashboard.
    2.  Add New Webhook: `https://your-domain.com/api/webhooks/payment`.
    3.  Select Events: `payment.captured`, `payment.failed`.
    4.  Copy the **Secret** and add it to your Gateway Config JSON as `"webhook_secret"`.

### 3.2. Verification Logic
*   **Razorpay:** Verify the signature `x-razorpay-signature` using the payload body and your webhook secret.
*   **PayU:** Verify the reverse hash sent in the POST response from PayU.

---

## 4. Troubleshooting

*   **"Invalid Key":** Double-check you are using Test keys in Test mode and Live keys in Live mode.
*   **"Signature Verification Failed":** Ensure the raw body of the webhook request is being used for hash generation, not the parsed JSON object.
*   **CORS Errors:** Ensure your frontend URL is whitelisted in the Gateway settings (if applicable).
