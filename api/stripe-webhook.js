import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configuración
const WEBHOOK_SECRET = 'whsec_pB7OLRdkCtf4xHu6ckVOqsD8sj92gbL5';
const SUPABASE_URL = 'https://dvvdwkwlxqhdrgpvscbc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2dmR3a3dseHFoZHJncHZzY2JjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzY3OTIwNjksImV4cCI6MjA1MjM2ODA2OX0.7K3hKX8vO7h4XPQeTkMoERqjFg-q7kRCXgN_6LqSUaU';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Verificar que el evento viene de Stripe
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Manejar el evento
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const customerEmail = session.customer_details?.email;
    const amountPaid = session.amount_total / 100;
    
    console.log('💰 Pago completado:', { email: customerEmail, amount: amountPaid });
    
    // Calcular créditos según paquete
    let creditsToAdd = 0;
    if (amountPaid === 10) creditsToAdd = 8.5;
    else if (amountPaid === 25) creditsToAdd = 21.25;
    else if (amountPaid === 50) creditsToAdd = 42.5;
    
    if (creditsToAdd > 0 && customerEmail) {
      try {
        // Buscar usuario por email
        const userResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${customerEmail}`,
          {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`,
            }
          }
        );
        
        const users = await userResponse.json();
        
        if (users && users.length > 0) {
          const user = users[0];
          const newCredits = (user.creditos || 0) + creditsToAdd;
          
          // Actualizar créditos
          const updateResponse = await fetch(
            `${SUPABASE_URL}/rest/v1/usuarios?id=eq.${user.id}`,
            {
              method: 'PATCH',
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=representation'
              },
              body: JSON.stringify({ creditos: newCredits })
            }
          );
          
          if (updateResponse.ok) {
            console.log(`✅ Agregados ${creditsToAdd} créditos a ${customerEmail}`);
          } else {
            console.error('Error actualizando créditos:', await updateResponse.text());
          }
        } else {
          console.log(`⚠️ Usuario no encontrado: ${customerEmail}`);
        }
      } catch (error) {
        console.error('Error en Supabase:', error);
      }
    }
  }

  return res.json({ received: true });
}
