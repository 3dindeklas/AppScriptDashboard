# Datadefinities

Alle Google Sheets-rijen worden eerst server-side omgezet naar één intern workshoprecord. De volgorde van kolommen maakt niet uit: de koppeling gebeurt op de genormaliseerde koptekst. Lege kolomkoppen worden als spacer genegeerd; een dubbele niet-lege koptekst geeft een fout omdat dan niet betrouwbaar gekozen kan worden.

## Intern workshoprecord

| Intern veld | Sheetkolom | Definitie |
| --- | --- | --- |
| `source` | configuratie | naam van de stichting/bron |
| `requestId` | `Aanvraag ID` | intern gebruikt voor datakwaliteitscontrole |
| `requestedDate` | `Datum aanvraag` | geldige datum als `YYYY-MM-DD`, anders `null` |
| `scheduledDate` | `Definitieve datum` | eerste geldige lesdag als `YYYY-MM-DD`, anders `null` |
| `scheduledDates` | `Definitieve datum` | alle unieke geldige lesdagen, chronologisch gesorteerd |
| `schoolYear` | afgeleid | schooljaar van de eerste definitieve lesdag, anders aanvraagdatum |
| `school` | `Schoolnaam` | intern voorbereid voor latere filtering |
| `schoolKey` | afgeleid | genormaliseerde schoolnaam plus regio |
| `region` | `Gemeente / Regio` | lege waarde wordt `Onbekend` |
| `workshop` | `Workshopnaam` | lege waarde wordt `Onbekende workshop` |
| `provider` | `Aanbieder` | lege waarde wordt `Onbekend` |
| `sessions` | `Lesmomenten` | geheel getal vanaf nul, anders `null` |
| `students` | `Aantal leerlingen` | geheel getal vanaf nul, anders `null` |
| `gradeLabel` | `Groep / leerjaar` | oorspronkelijke opgeschoonde tekst |
| `grades` | afgeleid | lijst met geldige PO- of VO-leerjaren |
| `sector` | `PO / VO` | `PO`, `VO` of `Onbekend` |
| `desiredPeriod` | `Gewenste periode` | opgeschoonde tekst |
| `location` | `Locatie` | intern; nog niet naar de browser |
| `type` | `Type` | lege waarde wordt `Onbekend` |
| `points` | `Punten per workshop` | getal of `null` |
| `providerWorkshopPrice` | `Prijs per workshop (aanbieder)` | bedrag of `null` |
| `travelCosts` | `Reiskosten aanbieder` | bedrag of `null` |
| `extraCosts` | `Extra kosten` | bedrag of `null` |
| `providerTotalCosts` | `Totale kosten aanbieder` | bedrag of `null` |
| `invoiceAmount` | `Te factureren i_lab` | bedrag of `null` |
| `marginAmount` | `Marge (€)` | bedrag of `null` |
| `marginPercent` | `Marge (%)` | percentagegetal of `null` |
| `financialComplete` | afgeleid | waar als totale kosten en factuurbedrag aanwezig zijn |
| `status` | `Status` | oorspronkelijke opgeschoonde status |
| `statusGroup` | afgeleid | vaste groep voor latere rapportage |
| `lastContactDate` | `Laatste contactdatum` | geldige datum of `null` |
| `actionRequired` | `Actie nodig` | opgeschoonde tekst |

Contactpersoon, e-mailadres, telefoon, notities, debuggegevens en e-mail-/kalender-ID's worden niet in het interne analyserecord opgenomen.

## Browserprojectie

`getDashboardData()` geeft uitsluitend de centraal toegestane velden voor de huidige interface en filters door:

| Browserveld | Bron |
| --- | --- |
| `source` | `source` |
| `requestedDate` | `requestedDate`, anders lege tekst |
| `scheduledDate` | `scheduledDate`, anders lege tekst |
| `scheduledDates` | kopie van alle geldige definitieve lesdagen, anders lege lijst |
| `schoolYear` | `schoolYear`, anders `Onbekend` |
| `school` | `school`, anders `Onbekende school` |
| `workshop` | `workshop` |
| `provider` | `provider` |
| `region` | `region` |
| `sector` | `sector` |
| `grades` | kopie van de genormaliseerde PO- of VO-leerjaren, anders lege lijst |
| `status` | `status` |
| `statusGroup` | `statusGroup`, anders `Overig` |
| `type` | `type`, anders `Onbekend` |
| `sessions` | `sessions` |
| `students` | `students` |

Aanvraag-ID, schoolKey, locatie, de oorspronkelijke tekst uit `Groep / leerjaar`, contactgegevens en financiële velden blijven server-side. Alleen de genormaliseerde numerieke leerjaren verlaten vanaf stap 7 de server, omdat deze nodig zijn voor de gewogen PO/VO-grafieken. Schoolnaam is vanaf stap 4 zichtbaar voor toegestane accounts omdat deze nodig is voor het schoolfilter.

## Dropdownfilters

De negen filters vergelijken steeds de exacte genormaliseerde waarde. Alle actieve dropdowns worden met `EN` gecombineerd: een workshopregel moet dus aan iedere gekozen waarde voldoen. De opties worden opnieuw uit de geladen gegevens opgebouwd na verversen. Schooljaren staan aflopend; overige opties alfabetisch volgens Nederlandse sortering.

## Datum- en bereikfilters

De gebruiker kiest of het maandbereik op `requestedDate` of de definitieve lesdagen werkt. De eerste dag tot en met de laatste dag van de gekozen eindmaand telt mee; een workshop op 30 april valt dus binnen een bereik dat eindigt in april. Bij meerdere definitieve datums blijft de workshop zichtbaar zodra minimaal één lesdag binnen het gekozen bereik valt. De tabel toont alle lesdagen en sorteert de workshop op de laatste lesdag. De sliderwaarden worden opgebouwd vanaf de vroegste tot en met de laatste geldige maand in de geladen data.

Een cel in `Definitieve datum` mag meerdere datums bevatten, bijvoorbeeld `20-11-2026, 27-11-2026` of datums op afzonderlijke regels. Nederlandse en ISO-notatie mogen worden gecombineerd. Dubbele datums worden verwijderd en de eerste chronologische lesdag blijft daarnaast beschikbaar als `scheduledDate` voor bestaande interne logica. Als een lijst zowel geldige als ongeldige datums bevat, blijven de geldige lesdagen bruikbaar en krijgt de bron één datakwaliteitswaarschuwing voor die regel.

Het leerlingbereik gebruikt uitsluitend gehele, niet-negatieve aantallen. De minimum- en maximumslider starten op de laagste en hoogste bekende waarde. Onder- en bovengrens kunnen elkaar niet passeren.

Een lege of ongeldige datum en een leeg of ongeldig leerlingaantal blijven onbekend. Zulke regels worden alleen meegenomen wanneer de bijbehorende keuze **zonder datum meenemen** of **zonder leerlingaantal meenemen** aanstaat. Beide keuzes staan standaard aan, zodat het eerste overzicht en **Filters wissen** alle workshopregels tonen.

## Getallen en bedragen

- Werkelijke numerieke nul blijft `0`.
- Leeg en ongeldig blijven `null`; ze worden niet stilzwijgend als nul geteld.
- Nederlandse notatie wordt ondersteund, bijvoorbeeld `€ 1.234,50` → `1234.5`.
- Een punt met drie cijfers erachter wordt als duizendtalseparator behandeld: `1.234` → `1234`.
- Aantallen zijn uitsluitend gehele, niet-negatieve waarden.
- Bij lesmomenten is ook een eenvoudige waarde zoals `2x` toegestaan.

## Datums en schooljaren

Ondersteunde datumwaarden:

- Google Sheets `Date`-objecten;
- `DD-MM-JJJJ` en `DD/MM/JJJJ`;
- `JJJJ-MM-DD` en `JJJJ/MM/DD`;
- Excel-serienummers, voorbereid voor de latere Microsoft-bron.

Ongeldige kalenderdatums zoals `31-02-2026` worden `null`. Een schooljaar loopt van 1 augustus tot en met 31 juli. `2026-07-31` hoort bij `2025–2026`; `2026-08-01` bij `2026–2027`.

## Statusgroepen

| Statuswaarden | Groep |
| --- | --- |
| Nieuw, Contact, Contact gelegd, Optie, Open | `Open` |
| Akkoord, Bevestiging, Ingepland | `Ingepland` |
| Uitgevoerd | `Uitgevoerd` |
| Geannuleerd, Afgezegd | `Geannuleerd` |
| Volgend schooljaar | `Volgend schooljaar` |
| overige waarden | `Overig` |

## Groepen en leerjaren

Voorbeelden die worden herkend:

- `groep 3 t/m 5` → PO 3, 4 en 5;
- `6/7/8` → PO 6, 7 en 8;
- `leerjaar 1/2` → VO 1 en 2.

PO accepteert groep 1 tot en met 8. VO accepteert leerjaar 1 tot en met 6. Als één getal buiten de sector valt, blijft de gehele leerjarenlijst leeg zodat geen gedeeltelijk onjuiste verdeling ontstaat.

## Grafieken en gewogen verdelingen

Alle grafieken gebruiken exact dezelfde workshopregels als de KPI's, vergelijking en recente-workshoptabel. Een wijziging in een dropdown, datumslider, leerlingslider of keuze voor onbekende waarden wordt daarom direct in iedere grafiek en bijbehorende tabel verwerkt.

De verdelingsgrafieken tellen per zichtbare workshopregel één aanvraag voor:

- onderwijssector (`PO`, `VO` of `Onbekend`);
- gemeente/regio;
- workshop;
- aanbieder;
- statusgroep.

De staafweergave toont bij lange lijsten de grootste categorieën en voegt de rest samen als **Overige**. De uitklapbare tabel onder iedere grafiek blijft volledig en toont alle categorieën afzonderlijk. Een lege selectie krijgt zowel in de grafiek als tabel een expliciete lege staat.

### Maandgrafiek

De maandgrafiek kan wisselen tussen aanvragen/workshops, leerlingdeelnames en lesmomenten. De waarden worden per stichting getoond. Bij **Datum aanvraag** hoort een workshop bij de ene maand van `requestedDate`.

Bij **Definitieve datum** worden alle geldige lesdagen binnen het zichtbare maandbereik gebruikt. Heeft één workshop meerdere zichtbare lesdagen, dan wordt zijn waarde evenredig over die lesdagen verdeeld en daarna per maand opgeteld. Twee lesdagen in september en één in oktober leveren dus 2/3 in september en 1/3 in oktober op. Hierdoor telt één workshop binnen de zichtbare periode samen nog steeds als één aanvraag; het leerlingaantal en het aantal lesmomenten worden op dezelfde manier verdeeld en niet automatisch vermenigvuldigd. Wanneer de periode wordt verkleind, wordt de verdeling opnieuw bepaald over de lesdagen die binnen die zichtbare periode vallen.

Workshopregels zonder geldige gekozen datum staan niet in de maandgrafiek, ook als **Workshops zonder gekozen datum meenemen** aanstaat. Zij blijven wel zichtbaar in de overige onderdelen en hun aantal wordt onder de grafiektitel gemeld. Bij leerlingdeelnames of lesmomenten worden regels zonder geldig bijbehorend aantal eveneens uit de maandgrafiek gelaten en apart gemeld.

### Gewogen PO/VO-leerjaren

PO en VO worden afzonderlijk berekend. Eén aanvraag wordt evenredig verdeeld over de herkende leerjaren: `groep 5/6` telt als 0,5 bij groep 5 en 0,5 bij groep 6. Een combinatie van drie groepen krijgt per groep exact 1/3. De berekening rondt tussentijds niet af; de interface toont maximaal twee decimalen. Een regel met de juiste sector maar zonder geldige leerjaren telt als **Onbekend**. Een onbekende sector wordt niet stilzwijgend bij PO of VO geplaatst.

## Datakwaliteitssignalen

De normalisatie telt per bron:

- rijen die boven `maxRowsPerSource` vallen en niet zijn ingelezen;
- lege rijen;
- ontbrekende aanvraag-ID's;
- unieke aanvraag-ID's die dubbel voorkomen;
- ongeldige aanvraagdatums;
- ongeldige definitieve datums;
- ongeldige leerlingaantallen;
- onbekende onderwijssectoren.

Deze signalen worden als aantallen getoond onder **Bronnen & datakwaliteit**. De browser ontvangt uitsluitend deze vaste tellers, nooit spreadsheet-ID's of technische Google-fouten.

## Bronstatus en volledigheid

Iedere bron krijgt onafhankelijk één status:

| Status | Betekenis |
| --- | --- |
| `demo` | fictieve gegevens voor veilig testen |
| `ok` | bron volledig gelezen zonder datakwaliteitssignalen |
| `warning` | bron gelezen, met één of meer getelde signalen |
| `error` | bron kon niet worden gelezen; andere bronnen blijven beschikbaar |
| `not-configured` | spreadsheet-ID of tabbladnaam ontbreekt |

Het totale overzicht is compleet wanneer alle geconfigureerde live-bronnen `ok` of `warning` zijn. Een waarschuwing betekent dus dat de bron beschikbaar is, maar dat bepaalde rijen aandacht vragen. Bij `error` of `not-configured` wordt het overzicht als onvolledig gemarkeerd. Live-modus valt nooit terug op demogegevens.

Een bronfout bevat in de browser alleen een vaste foutcode en een willekeurige referentie. De technische fout en stacktrace zijn uitsluitend terug te vinden in de afgeschermde Apps Script-uitvoeringslog met dezelfde referentie.

## Tellingen

Alle onderstaande cijfers worden berekend over exact dezelfde workshopregels die na de actieve dropdown-, datum- en bereikfilters zichtbaar zijn. Eén workshoprij staat voor één aanvraag/workshop, ook wanneer `scheduledDates` meerdere lesdagen bevat.

| Cijfer | Definitie |
| --- | --- |
| Aanvragen / workshops | aantal zichtbare workshopregels |
| Leerlingdeelnames | som van alle bekende waarden in `students`; geen telling van unieke leerlingen |
| Scholen | unieke combinatie van stichting, regio en genormaliseerde schoolnaam |
| Lesmomenten | som van alle bekende waarden in `sessions` |
| Uitgevoerd | aantal regels met `statusGroup` gelijk aan `Uitgevoerd` |
| Gem. leerlingen / aanvraag | leerlingdeelnames gedeeld door het aantal regels met een bekend leerlingaantal |
| Aanvragen / school | aantal regels met een bekende school gedeeld door het aantal unieke bekende scholen |
| Zonder leerlingaantal | aantal zichtbare regels waarvoor `students` onbekend is |

Bij het eenduidig tellen van scholen worden hoofdletters, accenten en overtollige spaties genegeerd. De stichting en regio blijven onderdeel van de sleutel: dezelfde schoolnaam in een andere regio of stichting telt daarom als een andere school. Een lege school of `Onbekende school` telt niet mee als school en ook niet in de teller van **Aanvragen / school**.

Een leerlingaantal van nul is een bekende waarde en telt mee in som en gemiddelde. Ontbrekende leerlingaantallen blijven onbekend, worden nooit als nul geïnterpreteerd en worden onder de KPI’s en per stichting apart gemeld. Gemiddelden worden met één decimaal getoond; als er geen geldige deler is, verschijnt `—`.

De stichtingvergelijking herhaalt dezelfde definities per bron. Ook wanneer het stichtingfilter actief is blijven beide stichtingen als rij zichtbaar; een door het filter uitgesloten stichting toont dan nulwaarden. Zo is direct zichtbaar dat de tabel dezelfde filters volgt.
