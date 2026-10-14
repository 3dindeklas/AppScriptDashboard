/** Entirely fictional fixtures. Never used as a fallback after a live-source failure. */
function demoPayload_() {
  const headers = ['Aanvraag ID', 'Datum aanvraag', 'Schoolnaam', 'Gemeente / Regio', 'Workshopnaam',
    'Aanbieder', 'Lesmomenten', 'Aantal leerlingen', 'Groep / leerjaar', 'PO / VO', 'Definitieve datum',
    'Type', 'Totale kosten aanbieder', 'Te factureren i_lab', 'Status'];
  const regions = ['Molenlanden', 'Vijfheerenlanden', 'Gorinchem', 'Altena'];
  const workshops = ['3D-sleutelhanger', 'Paper Circuits', 'Codeer een robot', 'Duurzaam huis met licht', 'Stopmotion studio', 'Micro:bit Magic'];
  const states = ['Uitgevoerd', 'Uitgevoerd', 'Akkoord', 'Nieuw', 'Contact gelegd', 'Bevestiging', 'Volgend schooljaar', 'Geannuleerd'];
  let records = [];
  const sources = ['Stichting A', 'Stichting B'].map((label, sourceIndex) => {
    const source = { id: 'stichting-' + (sourceIndex ? 'b' : 'a'), label: label };
    const matrix = [headers];
    for (let i = 0; i < 72 + sourceIndex * 19; i++) {
      const month = 1 + (i % 10), day = 2 + (i * 7 % 24);
      const requested = '2026-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const status = states[(i + sourceIndex * 3) % states.length];
      const scheduled = ['Uitgevoerd', 'Akkoord', 'Bevestiging'].includes(status)
        ? '2026-' + String(month + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0') : '';
      const vo = (i + sourceIndex) % 5 === 0;
      matrix.push([label + '-' + i, requested, 'Voorbeeldschool ' + String(1 + i % 18).padStart(2, '0'),
        regions[(i + sourceIndex) % 4], workshops[(i * 5 + sourceIndex) % 6],
        ['3Dindeklas', 'Maakplaats', 'Techniekatelier'][(i + sourceIndex) % 3], 1 + i % 3,
        i % 29 === 0 ? '' : 16 + i % 17, vo ? '1/2' : ['3/4', '5', '6/7/8'][i % 3], vo ? 'VO' : 'PO',
        scheduled, i % 3 ? 'Workshop' : 'Lessenreeks', 200 + i % 7 * 45, 300 + i % 7 * 60, status]);
    }
    const normalized = normalizeSource_(matrix, source); records = records.concat(normalized.records);
    return { id: source.id, label: label, ok: true, count: normalized.records.length, warnings: normalized.warnings };
  });
  return { demo: true, loadedAt: new Date().toISOString(), records: records, sources: sources };
}
