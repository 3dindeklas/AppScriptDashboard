# Bezoekstatistieken voor Workshopkompas

Workshopkompas kan iedere **geslaagde dashboardopening** in een verborgen tabblad `__stats` opslaan. De registratie vindt server-side plaats zodra `getDashboardData` succesvol is; een bronverversing (`refreshDashboardData`), een filterwijziging, kalendernavigatie, een mislukte aanmelding of alleen het aanvragen van een e-mailcode telt **niet** mee. Het gaat dus om dashboardopeningen (pageviews), niet om unieke bezoekers of het aantal afzonderlijke inlogpogingen. Een nieuwe geopende pagina of herlaadactie telt als een nieuwe opening.

## Inrichten

1. Voeg `Stats.gs` toe in hetzelfde Apps Script-project en neem de nieuwe `usageStats`-instelling over uit `Config.gs`.
2. Open in de Apps Script-editor **Projectinstellingen → Scripteigenschappen** en voeg toe:
   - **Property:** `WORKSHOPKOMPAS_STATS_SPREADSHEET_ID`
   - **Waarde:** het ID van het spreadsheet waarin de gegevens terecht moeten komen (de tekst tussen `/d/` en `/edit`).
3. Zorg dat het uitvoerende account van de web-app **bewerkingstoegang** heeft tot dit spreadsheet. Publiceer een nieuwe versie van de web-app en open het dashboard met een toegestaan account.
4. Het tabblad `__stats` wordt bij de eerste geslaagde dashboardopening automatisch aangemaakt, met een kopregel en de eerste registratie. Het wordt verborgen als in het spreadsheet nog een ander zichtbaar tabblad bestaat.

Het spreadsheet-ID staat bewust **niet** in de publieke GitHub-repository. Alternatief voor privé geforkte projecten: vul `usageStats.spreadsheetId` in `Config.gs`; die waarde heeft voorrang op de scripteigenschap. `usageStats.enabled = false` schakelt de registratie uit. Met `usageStats.sheetName` wijzig je de tabbladnaam.

## Kolommen

| Kolom | Betekenis |
| --- | --- |
| Tijdstip | Werkelijk tijdstip als Google Sheets-datum/tijd, weergegeven als `dd-mm-jjjj uu:mm:ss`. De weergave volgt de tijdzone van het spreadsheet. |
| Gebruiker (e-mailadres) | Geverifieerd e-mailadres uit de Google-allowlist of e-mailcodesessie. |
| Toegang | `Google-account` of `E-mailcode`. |
| Gebeurtenis | `Dashboard geopend`. |

Apps Script geeft niet voor elke toegestane gebruiker een betrouwbare voor- en achternaam terug. Daarom is e-mailadres het identificerende veld; je kunt desgewenst voor interne rapportages een apart, beveiligd namenoverzicht gebruiken. Wachtwoorden, IP-adressen, browserinformatie, tokens, contactpersonen en andere workshopgegevens worden niet opgeslagen.

## Bewaartermijn en veiligheid

De configuratie heeft standaard `retentionDays: 180`. Bij een geslaagd bezoek wordt maximaal eenmaal per UTC-dag geprobeerd om verouderde logregels vanaf het begin van het chronologische log te verwijderen. Bewaar de gegevens gesorteerd zoals ze worden toegevoegd; handmatig sorteren kan de opruimlogica verstoren. Andere bewaartermijn: wijzig `retentionDays` (1 t/m 3650).

Een verborgen werkblad is **geen toegangsbeveiliging**: iedere gebruiker met passende toegang tot het spreadsheet kan het tabblad zichtbaar maken. Beperk daarom de toegang tot het bestand, of gebruik liever een afzonderlijk afgeschermd statistiekenspreadsheet als anderen de overige tabbladen mogen bewerken. Maak duidelijk aan dashboardgebruikers dat het aantal bezoeken met hun e-mailadres wordt bijgehouden en waarvoor.

Registratie is niet kritisch: wanneer het werkblad niet beschikbaar is, de kopregel niet overeenkomt, een lock bezet is of een API-aanroep mislukt, blijft het dashboard normaal werken. Er wordt dan geen bezoek gelogd. Het tabblad mag bestaande gegevens niet automatisch overschrijven.

## Statistieken analyseren

Gebruik in een apart, afgeschermd overzicht een draaitabel op `__stats`: tel het aantal regels per dag, gebruiker of maand. Deze aantallen zijn **dashboardopeningen**, geen minuten dat het dashboard actief was. Voor unieke gebruikers per maand kun je e-mailadressen per maand ontdubbelen in een draaitabel of een aparte analyse.

De huidige opzet schrijft geen bezoekgegevens naar de dashboardbrowser en voegt geen statistieken toe aan de normale live-snapshot.
