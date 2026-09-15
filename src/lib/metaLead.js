export async function trackAcceptedLead(form, scoring, tracking) {
  const data = {
    name: form.contactName,
    email: form.email,
    phone: `55${form.whatsapp.replace(/\D/g, '')}`,
    country: 'BR',
    city: scoring?.city || undefined,
    state: scoring?.state || undefined,
    value: scoring?.value ?? 25,
    currency: scoring?.currency || 'BRL',
    content_name: 'Formulário de Contato',
    content_category: 'Lead Generation',
    lead_score: scoring?.lead_score,
    qualification_status: scoring?.qualification_status,
  };
  const events = [tracking.trackLead];
  if (scoring?.qualified === true) events.push(tracking.trackLeadQualificado);
  for (const send of events) {
    try {
      await send(data);
    } catch {
      console.error('Falha no tracking Meta; o cadastro já foi recebido.');
    }
  }
}
