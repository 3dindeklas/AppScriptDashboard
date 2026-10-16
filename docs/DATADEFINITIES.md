# Datadefinities van versie 1

De minimale versie verwerkt per rij alleen onderstaande analysevelden.

| Dashboardveld | Sheetkolom | Gebruik |
| --- | --- | --- |
| `source` | ingestelde bronnaam | filter op stichting |
| `date` | `Definitieve datum`, anders `Datum aanvraag` | sortering recente workshops |
| `workshop` | `Workshopnaam` | workshopgrafiek en tabel |
| `provider` | `Aanbieder` | voorbereid voor een latere filter |
| `region` | `Gemeente / Regio` | voorbereid voor een latere filter |
| `sector` | `PO / VO` | onderwijsfilter |
| `status` | `Status` | statusfilter en grafiek |
| `sessions` | `Lesmomenten` | totaal lesmomenten |
| `students` | `Aantal leerlingen` | totaal leerlingdeelnames |

`Leerlingdeelnames` is de som van `Aantal leerlingen` per workshoprij. Het is geen telling van unieke leerlingen.

## Privacy

Deze velden worden bewust niet aan de browser gegeven:

- aanvraag-ID;
- schoolnaam;
- contactpersoon;
- e-mailadres;
- telefoonnummer;
- locatie;
- notities;
- e-mail- en kalender-ID's;
- debuginformatie;
- financiële velden.

Financiële rapportage en schoolniveau kunnen later bewust worden toegevoegd, inclusief een nieuwe controle op toegangsrechten.
