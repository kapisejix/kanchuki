# AI-Driven Social Media Templates

**Status:** Done (Phase 1 - Quick Wins)

**Description:** Generate social media post templates from product images with AI-powered text suggestions and festive overlays to reduce content creation time and increase engagement.

## Functional Specification
- Generate Instagram post/reel templates from product images
- WhatsApp catalog/status templates with festive overlays
- Text suggestions based on regional trends & occasion

## Technical Implementation
- Use existing `studio-shoot` FLUX Konnet integration to apply stylized backgrounds
- New `social-template` microservice (Node.js) with OpenAI API for caption generation
- Store templates in S3/R2; serve via CDN
- Integrate with WhatsApp Business API for catalog updates

## Priority (Ease/Impact)
High (Reuses AI studio tech; Low-Medium dev; High impact on social engagement)

## Implementation Phase
Phase 1 (Quick Wins - 4-6 weeks)

## Notes
This feature builds on the existing AI studio technology and integrates with the WhatsApp Business API for catalog updates.