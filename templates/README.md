Place the compaction report template here:

- `ITR-EXB-003.docx`

This file is required by `/api/psp/compaction-report`.

## Placeholders (markers) disponibles

Para el template DOCX (`ITR-EXB-003.docx`), usa estos marcadores en el documento:

| Marcador | Descripción |
|----------|-------------|
| `REPORT_DATE` | Fecha del reporte |
| `REPORT_NUMBER` | Número del reporte |
| `WORK_LOCATION` | Ubicación |
| `SUPERVISOR_NAME` | Nombre del supervisor |
| `PENETROMETER_SN` | Serial del penetrómetro (ej. #3059-0325) |

**Para agregar Penetrometer S/N al template:** Inserta `PENETROMETER_SN` donde quieras que aparezca el serial (por ejemplo en la cabecera o junto a los metadatos). El valor se reemplazará automáticamente.

## Google Docs template (ITR email)

Si usás un template en Google Drive (`GOOGLE_DOC_TEMPLATE_ID`), agrega:

**`{{PENETROMETER_SN}}`**

En el lugar del documento donde debe mostrarse el serial del penetrómetro.
