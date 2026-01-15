export default async function handler(req, res) {
  // Solo aceptar POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const event = req.body;
    
    // Log para debugging
    console.log('Webhook recibido:', event.type);
    
    // Cuando se completa un pago
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      // Datos del pago
      const customerEmail = session.customer_details?.email;
      const amountPaid = session.amount_total / 100; // Stripe envía en centavos
      
      console.log('Pago completado:', {
        email: customerEmail,
        amount: amountPaid
      });
      
      // Calcular créditos según el paquete
      let creditsToAdd = 0;
      if (amountPaid === 10) creditsToAdd = 8.5;
      else if (amountPaid === 25) creditsToAdd = 21.25;
      else if (amountPaid === 50) creditsToAdd = 42.5;
      
      if (creditsToAdd > 0 && customerEmail) {
        // Aquí conectaremos con Supabase para agregar créditos
        // Por ahora solo logueamos
        console.log(`Agregar ${creditsToAdd} créditos a ${customerEmail}`);
      }
    }
    
    // Responder OK a Stripe
    return res.status(200).json({ received: true });
    
  } catch (error) {
    console.error('Error en webhook:', error);
    return res.status(400).json({ error: error.message });
  }
}
