<script lang="ts">
    import { startLoading, stopLoading } from '$lib/stores/loadingStore';
    import { toastStore as toast } from '$lib/stores/toastStore';

    export let applicationId: string;
    export let studentId: string;
    export let amount: number;
    export let paymentType: string;
    export let buttonClass: string = 'btn btn-sm btn-primary';
    export let buttonText: string = 'Pay Now';
    export let returnUrl: string = '/';

    async function handlePayment() {
        // Robust validation
        if (!amount || Number(amount) <= 0) {
            console.error('[PaymentButton] Invalid amount:', amount);
            toast.error('Invalid payment amount.');
            return;
        }
        if (!studentId) {
            console.error('[PaymentButton] Missing studentId');
            toast.error('Student ID is required for payment.');
            return;
        }

        console.log('[PaymentButton] Initiating payment:', { amount, studentId, applicationId, paymentType });
        
        startLoading();
        try {
            const response = await fetch('/api/payment/create-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Number(amount),
                    currency: 'INR',
                    description: `Payment for ${paymentType}`,
                    studentId,
                    applicationId,
                    metadata: { paymentType, returnUrl }
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to initiate payment');
            }

            if (data.payuParams) {
                // PayU Redirect flow (Requires POST)
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = data.paymentUrl;

                for (const key in data.payuParams) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.name = key;
                    input.value = data.payuParams[key];
                    form.appendChild(input);
                }

                document.body.appendChild(form);
                form.submit();
                return;
            }

            if (data.paymentUrl) {
                // Generic Redirect flow (GET)
                window.location.href = data.paymentUrl;
                return;
            }
            
            if (data.keyId) {
                // SDK Flow (Razorpay) - Mocking behavior for now since SDK is not loaded
                toast.info('SDK flow initialized (Mocked). Simulating success in 2 seconds...');
                console.log('SDK Initialization Data:', data);
                
                // Mock SDK Success Callback
                setTimeout(async () => {
                    try {
                        const verifyRes = await fetch('/api/payment/verify', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                transactionId: data.transactionId,
                                gatewayResponse: { payment_id: 'mock_sdk_pay_123', status: 'success' }
                            })
                        });
                        const verifyData = await verifyRes.json();
                        if (verifyRes.ok && verifyData.success) {
                            window.location.href = returnUrl || '/';
                        } else {
                            throw new Error(verifyData.message || 'Verification failed');
                        }
                    } catch (err: any) {
                        toast.error(err.message);
                    }
                }, 2000);
            } else {
                throw new Error('Invalid gateway response');
            }
        } catch (error: any) {
            console.error('Payment Error:', error);
            toast.error(error.message || 'Payment initiation failed');
        } finally {
            stopLoading();
        }
    }
</script>

<button class={buttonClass} on:click={handlePayment} disabled={amount <= 0}>
    {buttonText}
</button>
