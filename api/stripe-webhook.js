import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Configuración - CORREGIDA
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_UlEyS3mxGg3mxsfFbJQ7u4xY5CIdQs9i';
const SUPABASE_URL = 'https://wesmqqaijlmqhctrtaje.supabase.co';
const SUPABASE_KEY = 'sb_publishable_LgSAsCVW7tlDfDvkD8enyA_pQp42IZF';

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
    event = stripe.webhooks.constructEvent(buf, sig, WEBHOOK_SECRET);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook recibido:', event.type);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const customerEmail = session.customer_details?.email;
    const amountPaid = session.amount_total / 100;
    
    console.log('💰 Pago completado:', { email: customerEmail, amount: amountPaid });
    
    // Calcular créditos según el monto pagado
    let creditsToAdd = 0;
    let descripcion = '';
    
    // Packs con descuento 15%
    if (amountPaid === 10) {
      creditsToAdd = 8.5;
      descripcion = 'Pack 10€ - 8.5 créditos';
    } else if (amountPaid === 25) {
      creditsToAdd = 21.25;
      descripcion = 'Pack 25€ - 21.25 créditos';
    } else if (amountPaid === 50) {
      creditsToAdd = 42.5;
      descripcion = 'Pack 50€ - 42.5 créditos';
    }
    // Créditos sueltos (sin descuento)
    else if (amountPaid === 1.5) {
      creditsToAdd = 1.5;
      descripcion = '1 Crédito Standard';
    } else if (amountPaid === 3) {
      creditsToAdd = 3;
      descripcion = '1 Crédito Premium';
    }
    // Cualquier otro monto - dar créditos 1:1
    else {
      creditsToAdd = amountPaid;
      descripcion = `Compra de ${amountPaid}€ en créditos`;
    }
    
    console.log('📊 Créditos a agregar:', creditsToAdd);
    
    if (creditsToAdd > 0 && customerEmail) {
      try {
        // Buscar usuario por email
        const userResponse = await fetch(
          `${SUPABASE_URL}/rest/v1/usuarios?email=eq.${encodeURIComponent(customerEmail)}`,
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
          const currentCredits = parseFloat(user.creditos) || 0;
          const newCredits = currentCredits + creditsToAdd;
          
          console.log('👤 Usuario encontrado:', user.email);
          console.log('💰 Créditos actuales:', currentCredits);
          console.log('💰 Nuevos créditos:', newCredits);
          
          // Actualizar créditos del usuario
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
            console.log(`✅ ¡ÉXITO! Agregados ${creditsToAdd} créditos a ${customerEmail}`);
            console.log(`📊 Total créditos: ${newCredits}`);
            
            // Registrar transacción en la base de datos
            const transactionResponse = await fetch(
              `${SUPABASE_URL}/rest/v1/transacciones`,
              {
                method: 'POST',
                headers: {
                  'apikey': SUPABASE_KEY,
                  'Authorization': `Bearer ${SUPABASE_KEY}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                  usuario_id: user.id,
                  tipo: 'compra_creditos',
                  monto: amountPaid,
                  estado: 'completado',
                  descripcion: descripcion
                })
              }
            );
            
            if (transactionResponse.ok) {
              console.log('✅ Transacción registrada en la base de datos');
            } else {
              const transError = await transactionResponse.text();
              console.error('⚠️ Error registrando transacción:', transError);
            }
            
          } else {
            const errorText = await updateResponse.text();
            console.error('❌ Error actualizando créditos:', errorText);
          }
        } else {
          console.log(`⚠️ Usuario no encontrado: ${customerEmail}`);
        }
      } catch (error) {
        console.error('❌ Error en Supabase:', error);
      }
    } else {
      console.log('⚠️ No se calcularon créditos o no hay email');
    }
  }

  return res.json({ received: true });
}
