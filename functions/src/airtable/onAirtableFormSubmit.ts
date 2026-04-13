
import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';

// Security Token: In production, configure this via Firebase Secrets or Environment Variables.
// For now, we use this hardcoded string as the "password" for the integration.
const AIRTABLE_SECRET_TOKEN = 'LL_SECRET_AIRTABLE_2024_TOKEN_X92J';

export const onAirtableFormSubmit = functions.https.onRequest(async (req, res) => {
  // 1. Basic Security check
  const token = req.get('X-Airtable-Token') || req.query.token;
  
  if (token !== AIRTABLE_SECRET_TOKEN) {
    console.warn('Unauthorized Airtable sync attempt');
    res.status(401).send('Unauthorized');
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const db = admin.firestore();
  const data = req.body;

  try {
    console.log('Received Airtable Submission:', JSON.stringify(data));

    // 2. Mapping Logic
    // Fields from Airtable payload
    const professionalName = data['Booking By'] || 'Unknown Professional';
    const organisation = data['Organisation / Department'] || 'Guest Org';
    const contactEmail = data['Contact Email'] ? data['Contact Email'].toLowerCase().trim() : '';
    const languageTo = data['Language Requested'] || 'Portuguese'; // Defaulting to Port if missing
    const bookingDateTime = data['Booking Date & Time']; // Expected ISO string
    const sessionType = data['Session Type'] || 'F2F'; // F2F, Virtual, Phone
    const sessionLocation = data['Session Location'] || '';
    const costCode = data['Cost Code...'] || '';
    const notes = data['Notes'] || '';

    // 3. Date & Time Parsing
    let dateStr = new Date().toISOString().split('T')[0];
    let startTimeStr = '09:00';
    
    if (bookingDateTime) {
      const dt = new Date(bookingDateTime);
      if (!isNaN(dt.getTime())) {
        dateStr = dt.toISOString().split('T')[0];
        startTimeStr = dt.toTimeString().substring(0, 5);
      }
    }

    // 4. Session Mode Mapping
    let locationType: 'ONSITE' | 'ONLINE' = 'ONSITE';
    let sessionMode = 'Face-to-Face';

    if (sessionType.toLowerCase().includes('virtual') || sessionType.toLowerCase().includes('video')) {
      locationType = 'ONLINE';
      sessionMode = 'Videocall';
    } else if (sessionType.toLowerCase().includes('phone')) {
      locationType = 'ONLINE';
      sessionMode = 'Over the Phone';
    }

    // 5. Client & Organization Resolution
    let clientId = '';
    let organizationId = '';
    let clientName = organisation;

    if (contactEmail) {
      const clientsSnap = await db.collection('clients')
        .where('email', '==', contactEmail)
        .limit(1)
        .get();

      if (!clientsSnap.empty) {
        const clientDoc = clientsSnap.docs[0];
        clientId = clientDoc.id;
        organizationId = clientDoc.data().organizationId;
        clientName = clientDoc.data().companyName || organisation;
        console.log(`Matched existing client: ${clientId} in org: ${organizationId}`);
      } else {
        // Create New Guest Client & Organization
        console.log(`Creating new Guest Client for: ${contactEmail}`);
        organizationId = `org-guest-${Date.now()}`;
        const newClientRef = db.collection('clients').doc();
        clientId = newClientRef.id;

        await newClientRef.set({
          id: clientId,
          organizationId,
          companyName: organisation,
          contactPerson: professionalName,
          email: contactEmail,
          status: 'GUEST',
          billingAddress: 'Address Pending Update',
          paymentTermsDays: 30,
          defaultCostCodeType: 'PO',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }
    }

    // 6. Final Booking Object
    const bookingRef = `LL-${Math.floor(1000 + Math.random() * 9000)}`;
    const newBooking = {
      clientId,
      clientName,
      organizationId,
      bookingRef,
      professionalName,
      languageFrom: 'English', // Fixed as per request
      languageTo,
      date: dateStr,
      startTime: startTimeStr,
      durationMinutes: 60, // Default to 1 hour if not specified
      locationType,
      sessionMode,
      address: sessionLocation,
      costCode,
      notes,
      status: 'INCOMING',
      guestContact: {
        name: professionalName,
        organisation: organisation,
        email: contactEmail
      },
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const bookingDoc = await db.collection('bookings').add(newBooking);
    console.log(`✅ Success: Booking created with ID: ${bookingDoc.id} and Ref: ${bookingRef}`);

    // 7. Admin Notifications
    const adminsSnap = await db.collection('users')
      .where('role', 'in', ['ADMIN', 'SUPER_ADMIN'])
      .get();

    const batch = db.batch();
    adminsSnap.docs.forEach(adminDoc => {
      const notifRef = db.collection('notifications').doc();
      batch.set(notifRef, {
        userId: adminDoc.id,
        title: 'New Airtable Request',
        message: `New booking ${bookingRef} submitted via Airtable for ${languageTo} on ${dateStr}.`,
        type: 'URGENT',
        read: false,
        link: `/admin/bookings/${bookingDoc.id}`,
        createdAt: new Date().toISOString()
      });
    });

    await batch.commit();

    res.status(200).json({
      success: true,
      bookingId: bookingDoc.id,
      bookingRef
    });

  } catch (error: any) {
    console.error('❌ Integration Error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
