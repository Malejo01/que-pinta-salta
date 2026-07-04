const fs = require('fs');

async function main() {
  const url = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json';
  const res = await fetch(url);
  const payload = await res.json();
  const rawEvents = payload.oData?.oCartelera?.listaEspectaculoCartel || [];
  
  const event = rawEvents.find(e => e.idEspectaculoCartel === 17005);
  if (event) {
    console.log('Event 17005:', JSON.stringify(event, null, 2));
  } else {
    console.log('Event 17005 not found! Total events:', rawEvents.length);
    const matches = rawEvents.filter(e => e.cNombre.toLowerCase().includes('orquesta') || e.cNombre.toLowerCase().includes('sinfónica') || e.cNombre.toLowerCase().includes('salta'));
    console.log(`Found ${matches.length} matching events:`);
    matches.forEach(m => console.log(`- ${m.idEspectaculoCartel}: ${m.cNombre}`));
  }
}

main().catch(console.error);
