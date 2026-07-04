const fs = require('fs');

async function main() {
  const url = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json';
  console.log('Fetching', url);
  const res = await fetch(url);
  const payload = await res.json();
  const rawEvents = payload.oData?.oCartelera?.listaEspectaculoCartel || [];
  
  console.log('Total raw events:', rawEvents.length);
  
  // Find event with id 17005 or title containing 'Sinfonica'
  const event = rawEvents.find(e => e.idEspectaculoCartel === 17005 || e.cNombre.includes('Sinfónica') || e.cNombre.includes('Orquesta'));
  
  if (event) {
    console.log('Found event:', JSON.stringify(event, null, 2));
  } else {
    console.log('Event not found. Showing keys of the first event:');
    if (rawEvents.length > 0) {
      console.log(JSON.stringify(rawEvents[0], null, 2));
    }
  }
}

main().catch(console.error);
