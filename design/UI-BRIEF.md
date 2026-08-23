Redesign the existing **Rapid Bus Live** interface based on the attached reference.

Keep all existing functionality and information, but completely improve the visual design.

## DESIGN DIRECTION

Create a premium **black and white glassmorphism UI** with full:

* Dark Mode
* Light Mode

### STRICT RULES

* NO gradients anywhere
* NO colorful backgrounds
* NO neon design
* NO excessive blue
* NO glowing effects
* NO gaming-style UI
* NO oversized rounded cards
* NO thick borders around every element

The interface should feel:

**Apple Maps × Linear × modern automotive dashboard × premium glass UI**

Minimal, sophisticated, clean and professional.

---

# DARK MODE

Main background:
**#050505 / #080808**

Glass panels:

```css
background: rgba(18,18,18,0.72);
backdrop-filter: blur(20px);
border: 1px solid rgba(255,255,255,0.08);
```

Elevated glass:

```css
background: rgba(28,28,28,0.76);
```

Primary text:
**#FFFFFF**

Secondary text:
**rgba(255,255,255,0.65)**

Muted text:
**rgba(255,255,255,0.40)**

Dividers:
**rgba(255,255,255,0.08)**

Hover:
**rgba(255,255,255,0.06)**

Selected:
**rgba(255,255,255,0.10)**

---

# LIGHT MODE

Main background:
**#F5F5F5 / #FAFAFA**

Glass panels:

```css
background: rgba(255,255,255,0.72);
backdrop-filter: blur(20px);
border: 1px solid rgba(0,0,0,0.07);
```

Elevated glass:

```css
background: rgba(255,255,255,0.88);
```

Primary text:
**#090909**

Secondary text:
**rgba(0,0,0,0.62)**

Muted text:
**rgba(0,0,0,0.40)**

Dividers:
**rgba(0,0,0,0.07)**

Hover:
**rgba(0,0,0,0.04)**

Selected:
**rgba(0,0,0,0.07)**

---

# GLASSMORPHISM

Use glassmorphism carefully.

Do NOT make every small component a glass card.

Glass should mainly be used for:

* Main sidebar
* Selected route panel
* Floating map status
* Map controls
* Search
* Important floating overlays

Internal information should mostly use spacing and separators rather than cards inside cards.

Use approximately:

**16–24px backdrop blur**

with extremely subtle borders.

Do not use gradient transparency.

Use only solid rgba transparency.

---

# LAYOUT

Maintain:

**Left:** Route discovery
**Middle:** Selected route information
**Right:** Live map

But make the map visually dominant.

Remove the heavy visual separation between panels.

Use subtle glass panels with thin separators.

Increase whitespace significantly.

---

# LEFT SIDEBAR

Simplify the header.

Show:

Rapid Bus Live
PRASARANA · GTFS REALTIME

Use clean typography and more breathing room.

### Search

Create one large premium glass search bar.

Placeholder:

`Search route or place`

Do NOT show blue borders permanently.

Focused state can use:

```css
border: 1px solid rgba(255,255,255,0.25);
```

in dark mode.

---

# QUICK ROUTES

Change the existing TRY buttons into minimalist monochrome chips.

Example:

`250` `300` `T117` `401`

Default:

Transparent / subtle glass.

Selected:

White background + black text in dark mode.

Black background + white text in light mode.

This creates a strong monochrome selection state without using blue.

---

# RECENT

Make Recent extremely compact.

Avoid large outlined pills.

Use subtle monochrome route chips.

---

# ROUTES LIST

This area currently looks too crowded.

REMOVE the individual blue outlined cards.

Instead use clean rows:

```
[250]    Stesen LRT Wangsa Maju
         → Lebuh Ampang

         Rapid Bus KL · U2500        ›
```

Use subtle horizontal separators.

No permanent card borders.

Hover:

slightly lighter glass surface.

Selected route:

slightly stronger white/black transparent background.

Add a small vertical selection indicator if necessary.

---

# ROUTE NUMBER

Route numbers should appear inside simple square badges.

Dark mode:

White badge / black number.

Light mode:

Black badge / white number.

Avoid random colorful badges unless route color is genuinely important transit information.

---

# SELECTED ROUTE

Simplify significantly.

Top:

`SELECTED ROUTE`

Then:

```
[250]

Stesen LRT Wangsa Maju
→ Lebuh Ampang

Rapid Bus KL · U2500
```

Add a small:

`● LIVE`

status indicator.

Green may be used ONLY for genuine live status.

Do not use green decoratively.

---

# STATISTICS

Replace the four oversized cards.

Create one clean statistics area:

```
41             2
Stops          Buses Live

2              16
Patterns       Avg km/h
```

Use typography and spacing instead of heavy card borders.

Numbers should be visually dominant.

Labels should be small and muted.

---

# ARRIVALS / STOPS

Create a minimal monochrome segmented controller:

`Arrivals     Stops 41`

Selected state:

Dark Mode:
White background / black text

Light Mode:
Black background / white text

Unselected state should remain transparent.

No blue outlines.

---

# ROUTE STOP TIMELINE

This should become one of the strongest visual elements.

Use a vertical transit timeline:

```
●  KL117 BSN LEBUH AMPANG                 Arriving
│
●  KL30 AMANAHRAYA                        Arriving
│
●  KL31 HENTIAN MUNSHI ABDULLAH             2 min
│
●  KL32 CAPSQUARE                            3 min
│
●  KL1940 SOGO KL                            3 min
```

Use a thin white/gray vertical line.

Small monochrome circular stop markers.

Current/important stop can use a filled white circle.

Do not put each stop inside its own rounded rectangle.

Arrival information stays aligned to the right.

---

# MAP

The map should occupy the majority of the screen and feel much cleaner.

Keep route path and stops visible.

The actual route path can retain ONE functional accent color because it needs to remain readable against the map.

Everything around the map should remain monochrome.

---

# LIVE BUS MARKERS

Make live buses much cleaner.

Use:

* White circular marker
* Black bus icon
* Thin black outline
* Small glass label underneath
* Soft shadow

Dark map version may invert this.

Live buses should clearly stand out from regular stops.

Avoid large cartoon-looking markers.

---

# FLOATING LIVE STATUS

Redesign:

`● 2 buses live · Updated 28s ago     Following     ↻`

as one elegant floating glass control.

Dark Mode:

Transparent black glass.

Light Mode:

Transparent white glass.

The **Following** button should use monochrome inverted styling instead of blue.

Dark:
White background / black text.

Light:
Black background / white text.

---

# MAP CONTROLS

Location, zoom and refresh controls should use the same monochrome glass language.

Approximately:

40 × 40px

with:

* subtle border
* glass background
* simple icons
* no bright outline

---

# TYPOGRAPHY

Use:

**Inter, Geist or SF Pro**

Hierarchy:

Product title:
20–22px / 600

Route title:
17–18px / 600

Route list:
14–15px / 500

Body:
13px

Metadata:
11–12px

Large statistics:
24–28px / 600

Use uppercase sparingly.

---

# BORDER RADIUS

Reduce excessive rounding.

Use:

Search: 10–12px
Main glass panels: 14–16px
Buttons: 8–10px
Route badges: 8px
Floating controls: 10–12px

Do not make everything pill-shaped.

---

# SPACING

Use a strict spacing system:

4px
8px
12px
16px
20px
24px
32px

Increase whitespace significantly.

The interface should feel spacious even though it contains a large amount of information.

---

# DARK / LIGHT MODE TOGGLE

Add a minimal theme toggle.

Use only:

Sun icon
Moon icon

Place it discreetly near the top navigation or map controls.

Both modes must share exactly the same layout.

Only colors and glass transparency should change.

---

# MOST IMPORTANT

The final redesign should NOT feel like a generic admin dashboard.

It should feel like a premium dedicated **live public transportation tracking application**.

The design language must be:

**Black + White**
**Monochrome**
**Glassmorphism**
**No gradients**
**Minimal borders**
**Strong typography**
**Large map**
**Clean transit timeline**
**Dark + Light Mode**
**Premium and production-ready**

Preserve all existing Rapid Bus Live functions and route information.

Redesign the visual system, not the product functionality.
