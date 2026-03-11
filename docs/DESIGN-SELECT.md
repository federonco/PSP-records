# Select (Location / Inspector) – Referencia de estética

Documento de diseño para replicar el estilo del Select (trigger + listado desplegado) en otro proyecto.

---

## Stack

- **Biblioteca:** Radix UI Select (via shadcn/ui).
- **Componentes:** `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem`.

---

## Nombres de las partes

| Parte | Componente | Descripción |
|-------|------------|-------------|
| Botón cerrado | **SelectTrigger** | El control que muestra el valor actual y se hace clic para abrir (ej. "McLennan Dr - SEC3"). |
| Listado desplegado | **SelectContent** | El panel/dropdown que aparece con todas las opciones. |
| Cada fila del listado | **SelectItem** | Una opción dentro del listado (cada location, inspector, etc.). |

No se llama "select option": la opción es **SelectItem** y el listado es **SelectContent**.

---

## Identificación en DOM

- **Trigger:** `[data-slot="select-trigger"]`. Opcional: clase `psp-select-location-filled` o `psp-select-inspector-filled` cuando hay valor seleccionado.
- **Listado desplegado:** `[data-slot="select-content"]`.
- **Cada opción:** `[data-slot="select-item"]`.

---

## Estilos clave (para replicar)

### SelectTrigger
- Altura: `h-9` (36px).
- Ancho: `w-full` dentro del contenedor.
- Fondo: `var(--inner-bg)` o `var(--surface-alt)`.
- Borde: `var(--color-border-soft)` (#D3DAE1).
- Focus: `border-color: var(--color-border-soft)`, `box-shadow: 0 0 0 3px var(--ring-soft)`.

### SelectContent
- Fondo: `bg-popover` (o equivalente).
- Contenedor: `rounded-md`, `border`, `shadow-md`.
- Viewport: `p-1`. En este proyecto a veces `className="w-[360px] -mt-[2px] p-0"` para ancho fijo y pegado al trigger.

### SelectItem
- Padding: `py-1.5 pr-8 pl-2`.
- `rounded-sm`, texto `text-sm`.
- Focus: `bg-accent`, `text-accent-foreground`.
- En Location: `h-10 items-center` para filas más altas.

---

## Tokens CSS (definir en `:root`)

```css
--color-border-soft: #D3DAE1;
--ring-soft: rgba(211, 218, 225, 0.4);
--inner-bg: #F7FAFD;   /* o el valor que uses para fondos de inputs */
--surface-alt: #F7F9FB;
```

---

## Archivos de referencia en este repo

| Qué | Dónde |
|-----|--------|
| Componentes Select | `components/ui/select.tsx` |
| Estilos globales del trigger / borde / ring | `app/globals.css` (reglas `[data-slot="select-trigger"]`, `.psp-select-location-filled`, `.psp-select-inspector-filled`) |
| Uso en UI (Location, Inspector) | `app/page.tsx` (SelectTrigger + SelectContent + SelectItem) |

---

## Cómo usar esta referencia en otro proyecto

### Opción 1: Copiar el archivo
- Copia este `DESIGN-SELECT.md` (o `docs/DESIGN-SELECT.md`) al otro proyecto, por ejemplo en `docs/` o `design/`.
- Ábrelo cuando vayas a implementar o revisar el Select.

### Opción 2: Prompt para la IA (recall)
Cuando estés en **otro proyecto** y quieras que el Select se parezca a este, pega algo como:

```
Quiero que el Select (trigger + dropdown de opciones) siga la misma estética que en mi otro proyecto. 
Referencia de diseño:

- Trigger: altura 36px, ancho 100%, fondo var(--inner-bg) o var(--surface-alt), borde #D3DAE1, 
  al focus borde #D3DAE1 y ring 0 0 0 3px rgba(211,218,225,0.4).
- Listado (SelectContent): bg popover, rounded-md, border, shadow-md, viewport p-1; opcional ancho 360px.
- Cada opción (SelectItem): py-1.5 pr-8 pl-2, rounded-sm, focus bg-accent. Opcional h-10 para filas más altas.

Nombres: el botón es SelectTrigger, el listado desplegado es SelectContent, cada opción es SelectItem (Radix/shadcn).
```

Si tienes este README en el otro repo, puedes decir también:

```
Usa como referencia el archivo docs/DESIGN-SELECT.md de este repo para estilizar el Select (trigger + listado + items).
```

### Opción 3: Cursor / regla de proyecto
Si usas Cursor, puedes crear una regla (por ejemplo en `.cursor/rules/`) que diga: “Para componentes Select, seguir la guía en `docs/DESIGN-SELECT.md`”. Así la IA puede usar este doc al tocar Selects.

---

*Generado a partir del Select de Location/Inspector en PSP-records.*
