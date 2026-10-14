# Datadefinities

## Eenheden en berekeningen

| Begrip | Berekening / betekenis |
| --- | --- |
| Aanvragen | Aantal geldige ingelezen gegevensregels na filtering. Eén regel = één aanvraag. |
| Lesmomenten | Som van `Lesmomenten`. Niet automatisch gelijk aan aanvragen; ontbrekende waarden worden gemeld. |
| Leerlingdeelnames | Som van `Aantal leerlingen` per aanvraag. Niet vermenigvuldigd met lesmomenten. Niet te interpreteren als unieke personen. |
| Gemiddeld leerlingaantal | Bekende leerlingaantallen / aantal aanvragen met een geldig leerlingaantal. Een echte nul telt mee. |
| Scholen | Unieke combinatie van schoolnaam en gemeente, hoofdletterongevoelig en met genormaliseerde spaties. Over beide bronnen heen ontdubbeld. |
| Gemiddeld per school | Aanvragen met bekende schoolnaam / unieke scholen. Ontbrekende schoolnamen tellen niet mee in teller of noemer. |
| Uitgevoerd | Aanvragen met statusgroep `Uitgevoerd`. Andere statussen tellen wel mee in algemene totalen, tenzij uitgefilterd. |
| Leerjaren | Per aanvraag krijgt ieder genoemd leerjaar een gelijk deel. `6/7/8` geeft elk 1/3 aanvraag. De som blijft één. |
| Gem. dagen | Gemiddeld verschil tussen `Datum aanvraag` en `Definitieve datum`, uitsluitend geldige, niet-negatieve intervallen. Dit is **geen doorlooptijd tot het inplannen**; daarvoor ontbreekt een tijdstip van statuswijziging. |
| Kosten | Som van `Totale kosten aanbieder`. Geen nieuwe berekening uit deelbedragen. |
| Te factureren | Som van `Te factureren i_lab`. Geen vermenigvuldiging met lessen/aantallen. |
| Marge | Som factuurbedrag minus kosten, uitsluitend waar beide bedragen bekend zijn. |
| Gewogen marge | Marge / som factuurbedragen van dezelfde complete regels × 100. Geen gemiddelde van de kolom `Marge (%)`. Bij nul omzet niet beschikbaar. |

De schoolkey is een praktische benadering. Twee vestigingen met dezelfde naam in dezelfde gemeente worden samengeteld; afwijkende schrijfwijzen kunnen dubbel tellen. Zonder stabiele school-ID en leerling-ID kan unieke-school- of unieke-leerlingrapportage niet exact worden gegarandeerd.

De bron-ID is de stichting/vergelijkingseenheid. Meerdere tabbladen voor één stichting worden nu afzonderlijke bronnen; groepeer die vooraf in één rapportagetabblad als één stichtingstotaal nodig is. Twee verschillende bronnen met dezelfde aanvraag-ID blijven twee aanvragen. Er wordt niet gegokt of dit hetzelfde evenement is. Binnen één bron blokkeert een dubbele niet-lege aanvraag-ID de bron; corrigeer die bron voordat je rapporteert. Bij ontbrekende ID’s blijft de regel staan met een datakwaliteitsmelding.

## Kolommen

| Bronkolom | Gebruik |
| --- | --- |
| Aanvraag ID | Duplicaatcontrole binnen de bron; nooit naar browser |
| Datum aanvraag / Definitieve datum | Periode, schooljaar, maandgrafiek en datuminterval |
| Schoolnaam / Gemeente / Regio | Filters, regioverdeling en schooltelling |
| Workshopnaam / Aanbieder / Type | Filters en verdelingen |
| Lesmomenten / Aantal leerlingen | Niet-negatieve gehele aantallen; leeg/ongeldig blijft onbekend |
| Groep / leerjaar / PO / VO | Leerjaarverdeling en onderwijsfilter |
| Totale kosten aanbieder / Te factureren i_lab | Financiële totalen en berekende marge |
| Status | Bronstatus en configureerbare statusgroep |
| Alle andere kolommen | Niet in het dashboard opgenomen, ook niet in een verborgen tabel |

Verplicht aanwezige koppen: `Aanvraag ID`, `Datum aanvraag`, `Schoolnaam`, `Workshopnaam`, `Aantal leerlingen`, `Status`. Andere ontbrekende kolommen krijgen een onbekende/lege waarde. Zet alternatieve kopteksten in `CONFIG.headerAliases`, bijvoorbeeld:

```js
headerAliases: {
  'Schoolnaam': ['School'],
  'Te factureren i_lab': ['Factuurbedrag']
}
```

Koppen worden gematcht na trimmen, normaliseren van witruimte en omzetten naar kleine letters. Dubbele relevante koppen zijn een bronfout, zodat niet willekeurig een van de twee wordt gelezen. Lege spacer-kolommen worden genegeerd.

## Invoer en onbekende waarden

- Nederlandse tekstbedragen zoals `€ 1.234,50` en native getallen worden ondersteund. Tekst `1.234` betekent conform Nederlandse notatie **1234**. Gebruik native getallen voor ondubbelzinnige decimalen. Andere valuta-/locale-notaties zijn niet automatisch gegarandeerd.
- Leerlingen en lesmomenten moeten gehele niet-negatieve getallen zijn. `2x`, `ca. 25`, `20–25` of negatieve aantallen blijven onbekend. Een echte `0` is geldig.
- Ondersteunde datums: echte Sheets-datums (Europe/Amsterdam), numerieke Excel-1900-datums en tekst `dd-mm-jjjj`, `dd/mm/jjjj`, `jjjj-mm-dd`. Werkmappen met het Excel-1904-datumsysteem zijn niet ondersteund. Gebruik daar tekst in ISO-formaat of schakel het datumsysteem om.
- Meerdere uitvoeringsdatums in één cel blijven onbekend. Voor maandrapportage per individueel lesmoment is een aparte lesmomententabel nodig. Deze versie verdeelt aanvragen niet over meerdere uitvoeringsdatums.
- `PO / VO` verwacht `PO` of `VO`. Andere waarden worden `Onbekend`.
- Leerjaren ondersteunen `3/4`, `3,4`, `3 & 4`, `3 en 4`, `3+4`, `3-5`, `3 t/m 5` en prefixes `groep`, `leerjaar`, `klas`. Geldig: PO 1–8 en VO 1–6. Onherkenbare tekst en tegenstrijdige reeksen vallen onder onbekend.
- Schooljaar loopt van **1 augustus tot en met 31 juli** en gebruikt de gekozen datumbasis. Het dashboard heeft geen automatische “huidig schooljaar”-filter; standaard zie je alle data.
- Periode-sliders zijn inclusief de gehele begin- en eindmaand. Onbekende datums en aantallen worden alleen meegenomen als het overeenkomstige vinkje aanstaat. Een specifiek schooljaar sluit onbekende datums alsnog uit, behalve bij de optie `Onbekend`.
- Ontbrekende student-/lesaantallen leveren geen fictieve nul in het datamodel; totalen tellen bekende waarden op en noemen ontbrekende waarden afzonderlijk. Een totaal van nul zonder bekende waarden is dus geen bewijs van nul deelname.
- Financiële bedragen volgen de btw-/valutabasis van de bron. Gebruik in beide bronnen dezelfde euro- en btw-definitie; er vindt geen conversie plaats.
- Bronmeldingen betreffen alle geladen regels, ook als de gebruiker filtert. Een regel kan meerdere aandachtspunten opleveren.

## Statusgroepen

| Bronstatus (hoofdletterongevoelig) | Groep |
| --- | --- |
| Nieuw, Contact, Contact gelegd, Optie, Open | Open |
| Akkoord, Bevestiging, Ingepland | Ingepland |
| Uitgevoerd | Uitgevoerd |
| Geannuleerd, Afgezegd | Geannuleerd |
| Volgend schooljaar | Volgend schooljaar |
| Andere / ontbrekende status | Overig |

Deze mapping staat in `Config.gs`. Geannuleerde aanvragen worden standaard wel geteld als aanvraag; gebruik het statusfilter voor een specifieke rapportage. `Volgend schooljaar` is een status, geen automatische datumcorrectie. Een aanvraag met die status houdt haar oorspronkelijke aanvraagdatum.

## Handmatige acceptatie

Gebruik bijvoorbeeld twee kleine bronnen met elk twee regels. Noteer vooraf aanvragen, leerlingaantallen, lessen, unieke schoolnamen, bedragen en statusgroepen. Controleer daarna:

1. Gecombineerd totaal en iedere stichting afzonderlijk.
2. Zelfde schoolnaam en gemeente in beide bronnen telt gezamenlijk één school.
3. Januari/augustus-grens, definitieve datums en ontbrekende datums.
4. `6/7/8` blijft samen precies één aanvraag.
5. Ontbrekende financiële waarden veranderen de margegrondslag zichtbaar.
6. Intrekken van toegang of hernoemen van een bron leidt tot een bronfout, geen fictieve cijfers.
7. Telefoon, mail, notities en tokens ontbreken in de RPC-response.
