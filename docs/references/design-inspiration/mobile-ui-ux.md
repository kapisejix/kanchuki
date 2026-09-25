# Mobile Application UI/UX References

## Design Inspiration & Trend Sources

### 1. Apple Human Interface Guidelines
**URL**: https://developer.apple.com/design/human-interface-guidelines/

The definitive reference for iOS design principles. Covers layout, typography, color, iconography, and interaction patterns. Use this as the baseline for native-feeling mobile experiences.

**Key takeaways for Kanchuki**:
- Use system fonts (SF Pro on iOS, Roboto on Android) for body text.
- Maintain 44pt minimum touch targets.
- Use semantic color names and dynamic type.
- Adhere to safe area insets for notch/home indicator.

---

### 2. Material Design 3 (Material You)
**URL**: https://m3.material.io/

Google's latest design system with dynamic color, updated components, and flexible theming. Strong reference for Android-first experiences.

**Key takeaways for Kanchuki**:
- Dynamic color extraction from user's wallpaper.
- Updated color roles (primary, on-primary, primary-container, etc.).
- New component specs: Bottom sheets, navigation bars, FABs.
- Emphasis on large touch targets and accessible contrast.

---

### 3. Dribbble — Mobile App Designs
**URL**: https://dribbble.com/search/mobile-app-design

Curated shots from top designers. Search for "fashion app", "ecommerce mobile", "retail app" for industry-specific inspiration.

**What to look for**:
- Card-based product grids with image-first layouts.
- Bottom navigation patterns for 3–5 primary sections.
- Empty states and onboarding flows.
- Micro-interactions (like, save, share buttons).

---

### 4. Behance — Mobile UI/UX Case Studies
**URL**: https://www.behance.net/search/projects?search=mobile%20app%20UI

Full case studies with process, wireframes, and final designs. Search "fashion ecommerce", "retail app", "catalog app".

**What to look for**:
- Onboarding sequence designs.
- Product detail page layouts (image carousel + specs + actions).
- Filter and search UX patterns.
- Dark mode implementations.

---

### 5. Mobbin — Mobile Design Patterns
**URL**: https://mobbin.com/

A searchable library of real app screenshots organized by pattern, flow, and platform. Free tier available.

**What to look for**:
- "Product grid" patterns for catalog browsing.
- "Bottom sheet" patterns for product detail / filters.
- "Empty state" patterns for no-data screens.
- "Onboarding" patterns for first-run experience.

---

### 6. Pttrns — Mobile UI Patterns
**URL**: https://pttrns.com/

Curated iOS and Android patterns with code snippets. Focuses on interaction design and animation.

**What to look for**:
- "Shopping" category for e-commerce flows.
- "Onboarding" for signup/login patterns.
- "Profile" for retailer dashboard patterns.
- "Lists" for catalog browsing.

---

## Color Scheme References

### 7. Coolors — Color Palette Generator
**URL**: https://coolors.co/

Generate and explore curated palettes. Use the "Explore" tab to find trending palettes.

**Recommended approach**:
- Start with a base hue (navy/indigo for Kanchuki's existing brand).
- Generate analogous or complementary accents.
- Test contrast ratios using the built-in accessibility checker.

---

### 8. Color Hunt
**URL**: https://colorhunt.co/

Community-curated color palettes. Search "dark mode", "minimal", "elegant" for refined palettes.

**What to look for**:
- Palettes with 4–5 colors (primary, secondary, accent, background, text).
- High-contrast palettes for readability.
- Palettes with warm neutrals (cream, sand, charcoal).

---

### 9. Adobe Color
**URL**: https://color.adobe.com/create/color-wheel

Advanced color wheel with accessibility checks, contrast ratios, and trend palettes.

**What to look for**:
- "Trends" section for current color directions.
- "Accessibility" tool for WCAG AA/AAA validation.
- "Extract Theme" from images (upload a product photo to generate a palette).

---

### 10. Realtime Colors
**URL**: https://www.realtimecolors.com/

Preview color palettes on real UI components (buttons, cards, nav bars) in real time.

**What to look for**:
- How your palette looks on a mock phone screen.
- Button, card, and input states with your colors.
- Dark mode preview.

---

## Component & Interaction Libraries

### 11. React Native Paper
**URL**: https://callstack.github.io/react-native-paper/

Material Design 3 components for React Native. Use as a reference for component specs and implementation.

**What to look for**:
- `BottomSheet` component specs.
- `Card` component with image, title, subtitle.
- `Button`, `IconButton`, `FAB` variants.
- `Searchbar` component.

---

### 12. NativeBase
**URL**: https://nativebase.io/

Utility-first component library for React Native. Good reference for accessible, themeable components.

**What to look for**:
- `VStack` / `HStack` layout patterns.
- `Pressable` with ripple effects.
- `Avatar`, `Badge`, `Divider` components.
- Theming system with light/dark mode.

---

### 13. Tamagui
**URL**: https://tamagui.dev/

Design system for React Native + Web. Strong TypeScript support and animation primitives.

**What to look for**:
- `Adapt` component for responsive layouts.
- `Button`, `Input`, `Sheet` primitives.
- Theme switching with CSS variables.
- Animation system with `animate` prop.

---

### 14. Expo Snack — Community Examples
**URL**: https://snack.expo.dev/

Browse community Expo projects. Search "fashion", "catalog", "retail" for relevant examples.

**What to look for**:
- Image carousel implementations.
- Bottom sheet patterns.
- Pull-to-refresh and infinite scroll.
- Camera integration examples.

---

## Typography References

### 15. Google Fonts — Inter
**URL**: https://fonts.google.com/specimen/Inter

The primary sans-serif font for Kanchuki mobile. Review the specimen for weight usage, spacing, and readability.

**What to look for**:
- Weight spectrum (400–700) for hierarchy.
- Number tabular figures for prices/statistics.
- Line height recommendations for mobile body text.

---

### 16. Fontsource — Font Loading
**URL**: https://fontsource.org/

Self-hosted font loading for React Native. Reference for implementing custom brand fonts in the mobile app.

---

## Animation & Motion

### 17. Reanimated 3 Documentation
**URL**: https://docs.swmansion.com/react-native-reanimated/

The animation library used in Kanchuki mobile. Reference for gesture-based animations, layout transitions, and shared element transitions.

**What to look for**:
- `withSpring` for natural-feeling transitions.
- `Gesture` and `GestureDetector` for swipe/pinch.
- `SharedTransition` for image detail transitions.
- `useAnimatedStyle` for performant style updates.

---

### 18. Framer Motion for React Native (Motion)
**URL**: https://motion.dev/

If considering a web-consistent animation layer, Motion provides Framer Motion-like APIs for React Native.

---

## Accessibility

### 19. WebAIM — Contrast Checker
**URL**: https://webaim.org/resources/contrastchecker/

Validate WCAG AA/AAA contrast ratios for your color palette.

---

### 20. Stark (Figma Plugin)
**URL**: https://www.getstark.co/

Accessibility checker for Figma designs. Use during the design phase to catch contrast and touch target issues early.

---

## Industry-Specific Inspiration

### 21. Myntra Mobile App
**URL**: https://play.google.com/store/apps/details?id=com.myntra.android

Leading Indian fashion e-commerce app. Study their catalog browsing, filters, product detail, and checkout flows.

**What to study**:
- Image-heavy catalog with clean typography.
- Size selector and color swatch patterns.
- Wishlist and bag interactions.
- WhatsApp-style share buttons.

---

### 22. Ajio Mobile App
**URL**: https://play.google.com/store/apps/details?id=com.ril.ajio

Another major Indian fashion retailer. Strong reference for ethnic wear + western wear mixed catalogs.

**What to study**:
- Category navigation with images.
- Video integration in product listings.
- Size guide patterns.
- Offline browsing indicators.

---

### 23. WhatsApp Business Catalog
**URL**: https://faq.whatsapp.com/general/channels/how-to-create-a-catalog

Since Kanchuki distributes via WhatsApp, study how WhatsApp Business catalogs present products.

**What to study**:
- Minimal product cards.
- Quick reply / enquire buttons.
- Image-first layout with minimal text.

---

## Prototyping & Design Tools

### 24. Figma Community — Mobile UI Kits
**URL**: https://www.figma.com/community

Search "mobile UI kit", "ecommerce mobile", "fashion app" for free and paid templates.

---

### 25. Figma Community — Design Systems
**URL**: https://www.figma.com/community/search?type=design_systems

Search "iOS design system", "Material Design 3", "Ant Design Mobile" for component libraries.

---

## Summary

| Category | Top 3 References |
|----------|-----------------|
| Design Principles | Apple HIG, Material Design 3, Mobbin |
| Color Palettes | Coolors, Color Hunt, Adobe Color |
| Component Specs | React Native Paper, NativeBase, Tamagui |
| Typography | Google Fonts (Inter), Fontsource |
| Animation | Reanimated 3, Motion |
| Industry | Myntra, Ajio, WhatsApp Business |
| Prototyping | Figma Community, Behance, Dribbble |
