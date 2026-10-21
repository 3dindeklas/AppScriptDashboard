# Implementatie en acceptatie

De roadmap blijft het historische requirementsdocument. We houden implementatie en praktijkacceptatie apart: code kan aanwezig en getest zijn, terwijl de echte bron of gepubliceerde Apps Script-versie nog gecontroleerd moet worden. De actuele merge-status volgt uit de betreffende PR op GitHub.

| Onderdeel | Implementatie | Praktijkacceptatie |
| --- | --- | --- |
| Stap 0–8 | Aanwezig in bestaande basis: datamodel, toegang, filters, cijfers, grafieken en financiën | Na bron-/rechtenwijziging relevante controles herhalen |
| Stap 8.1 | Snapshot en laadfeedback aanwezig | Snapshot én bronimporttijd controleren bij importbronnen |
| Stap 9/9.1 | Vormgeving, donuts, gemeentekaart en compacte indeling aanwezig | Gepubliceerde wijzigingen controleren |
| Toegangspagina en e-mailcodes | PR #19 gemerged | Deployment- en mailrechten blijven omgevingsafhankelijk |
| Demo-opruiming | PR #20 gemerged | Gewone Google-bronnen blijven de basis |
| Oorspronkelijke stap 10 met Graph/OAuth | PR #21 gesloten en niet gemerged; aanpak vervangen | Niet van toepassing op de nieuwe aanpak |
| Vervangende stap 10: Excel-importtabblad | Geïmplementeerd in [PR #22](https://github.com/3dindeklas/AppScriptDashboard/pull/22), met geautomatiseerde controles | **Open: echte Drive-export/download en Apps Script-publicatie controleren** |

De aangeleverde organisatielink vereiste bij een anonieme controle aanmelden (HTTP 401). De demo-openlink gaf een webpagina. Geen van beide is als werkende automatische downloadbron geaccepteerd. Er zijn geen echte workshopgegevens opgehaald of geïmporteerd tijdens deze implementatie.

Voor de beschermde organisatiebron is een in Google Drive geplaatste Excel-export de route zonder Microsoft-authenticatie. Alleen een werkelijke downloadbron kan automatisch actueel worden opgehaald. Doorloop [de acceptatiechecklist](EXCEL_IMPORT.md#praktijkacceptatie-nog-open) vóór “praktijk-geaccepteerd” wordt afgevinkt.

| Controle | Datum / versie | Resultaat |
| --- | --- | --- |
| URL-import, conversie, staging, behoud bij fouten en rechten | Geautomatiseerde tests met gesimuleerde Google-services | Implementatie gecontroleerd; platformtest open |
| Organisatie-export in Drive | Nog niet uitgevoerd | Open |
| Publieke OneDrive-downloadroute | Redirectcookie-afhandeling gecontroleerd; HTTP 200 met Excel-bestandskop | Download bevestigd; conversie/import nog open |
| Gepubliceerde Apps Script-versie, gastlogin en tijdtrigger | Nog niet uitgevoerd voor importversie | Open |

Na een geslaagde praktijkcontrole: noteer versie, datum en resultaat in deze tabel. Pas daarna is stap 10 afgerond. Nieuwe wensen kunnen vervolgens als afzonderlijke issues/PR's worden uitgewerkt.

PR #22 bevat ook de editorhulpen authorizeApp en checkAppSetup, met aparte tests voor scopes, services, schrijftest, opruimen en bronbereikbaarheid. De algemene Apps Script-melding zonder eigen startlog kan niet door de functie worden afgevangen. De publieke OneDrive-link gaf aanvankelijk HTTP 401 door ontbrekende redirectcookie-afhandeling. Na correctie is de downloadroute met HTTP 302 → 200 en Excel-bestandskop bevestigd; een volledige Google-import met deze bron is nog niet uitgevoerd.
