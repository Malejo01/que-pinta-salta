async function main() {
  const url = 'https://s3.sa-east-1.amazonaws.com/contenido.general.entradauno/cache/12/cartelera.json';
  const res = await fetch(url);
  const payload = await res.json();
  const oCartelera = payload.oData?.oCartelera;
  const rawEvents = oCartelera.listaEspectaculoCartel || [];
  const rawVenues = oCartelera.listaEstablecimiento || [];
  
  const saltaVenues = rawVenues.filter((v) => 
    (v.cZona && v.cZona.toLowerCase().trim() === 'salta') ||
    (v.idProvincia === 16)
  );
  const saltaVenueIds = new Set(saltaVenues.map((v) => v.idEstablecimiento));
  
  const saltaEvents = rawEvents.filter(e => {
    const ids = e.listaIdEstablecimiento || [];
    return ids.some(id => saltaVenueIds.has(id));
  });
  
  console.log(`Found ${saltaEvents.length} Salta events on EntradaUno:`);
  saltaEvents.forEach(e => {
    console.log(`- ID: ${e.idEspectaculoCartel}`);
    console.log(`  Title: ${e.cNombre}`);
    console.log(`  fPrecioDesde: ${e.fPrecioDesde}`);
    console.log(`  cSeo: ${e.cSeo}`);
    console.log(`  cDescripcion matches for price:`);
    const cleanDesc = decodeURIComponent(e.cDescripcion || '').replace(/<[^>]+>/g, '');
    const priceText = cleanDesc.match(/(\$\s*\d+[\d.,]*|precio|valor|desde)/i);
    console.log(`    Has Price Mention in Desc: ${priceText ? priceText[0] : 'No'}`);
  });
}

main().catch(console.error);
