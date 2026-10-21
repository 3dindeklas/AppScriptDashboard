# Implementatie en acceptatie

De roadmap blijft het overzicht van de oorspronkelijke requirements. We verwijderen afgeronde requirements niet: deze pagina houdt bij wat in code aanwezig is en welke acceptatie nog nodig is.

**Geïmplementeerd** betekent dat de code en geautomatiseerde controles aanwezig zijn. **Gemerged** betekent dat de review is afgerond en de wijziging in main staat. **Praktijk-geaccepteerd** betekent dat de gepubliceerde Apps Script-versie met de echte omgeving is gecontroleerd. Een merge markeert de laatste status niet automatisch als voltooid.

| Onderdeel | Implementatie / review | Praktijkacceptatie |
| --- | --- | --- |
| Stap 0–8: basis, datamodel, toegang, bronstatus, filters, cijfers, grafieken en financiën | Aanwezig in de bestaande basis | Bestaande gebruikerscontroles; na bron- of rechtenwijziging opnieuw controleren |
| Stap 8.1: snapshot en laadfeedback | Aanwezig in de bestaande basis | Opnieuw controleren bij een nieuwe databron |
| Stap 9/9.1: vormgeving, donuts, gemeentekaart en compacte indeling | Aanwezig in de bestaande basis | Bestaande gebruikerscontroles; gewijzigde publicatie controleren |
| Toegangspagina en e-mailcodes | PR #19 gemerged | Mailrechten en eigenaar-deployment blijven omgevingsafhankelijk |
| Demo-opruiming | PR #20 gemerged | Google Sheets/snapshot na publicatie controleren |
| Stap 10: Microsoft Graph-adapter, gedelegeerde OAuth, tokenrotatie, paginering en gedeelde normalisatie | Geïmplementeerd in de Microsoft-PR; review/merge open | **Open: echte Microsoft-tenant nog niet getest** |

## Nog nodig voor afronding stap 10

1. Review de Microsoft-PR na de demo-opruiming.
2. Volg [MICROSOFT.md](MICROSOFT.md) voor Entra, Script Properties, eigenaar-deployment en de eenmalige toestemming.
3. Doorloop de praktijkacceptatiechecklist in die handleiding.
4. Leg hieronder de testversie, datum en uitkomst vast. Bij een fout blijft de betreffende acceptatie open; code kan al wel gemerged zijn.

| Acceptatie | Versie en datum | Resultaat |
| --- | --- | --- |
| Microsoft-tenant en eerste combinatie met Google | Nog niet uitgevoerd | Open |
| Paginering, datums, financiële rechten en bronuitval | Alleen geautomatiseerde tests met gesimuleerde services | Praktijkcontrole open |
| Tokenvernieuwing en tijdtrigger | Alleen geautomatiseerde tests met gesimuleerde services | Praktijkcontrole open |
| Publicatie en gastlogin | Nog niet uitgevoerd voor de Microsoft-versie | Open |

Na acceptatie kan stap 10 als afgerond worden gemarkeerd. De roadmap kan daarna als historisch requirementsdocument blijven bestaan; nieuwe uitbreidingen krijgen een eigen issue/PR met acceptatiecriteria. Dit voorkomt dat “geïmplementeerd” ten onrechte “werkt al in productie” betekent.
