# Retailer → Customer AI Fashion Commerce Platform

## Detailed Application Architecture Blueprint

---

## 1. Product Objective

Build a mobile-first AI platform for small and medium clothing retailers, especially Indian fashion stores, that allows them to:

* Save customer profiles
* Understand each customer’s fashion preferences
* Share only highly relevant new arrivals
* Let customers try selected products from home
* Collect interest through WhatsApp
* Accept payment through UPI
* Ship products to customers
* Maintain long-term customer relationships

This system should work even if the retailer has:

* No website
* No app
* No inventory software
* No ERP
* No barcode system
* No e-commerce store

The platform becomes the retailer’s **AI-powered digital sales assistant + customer CRM + remote try-on storefront**.

---

# 2. Core Product Positioning

## Product Name Concept

**AI Fashion CRM & Try-On Platform for Retailers**

## Core Promise

```text
Send the right products to the right customers, let them try outfits from home, collect orders on WhatsApp, receive UPI payments, and ship products — without building a website.
```

---

# 3. Primary Users

## 3.1 Retailer / Shopkeeper

The retailer uses the app to:

* Add customers
* Add products
* Upload new arrivals
* Create personalized collections
* Share collections through WhatsApp
* Track customer interests
* Receive payment
* Manage delivery
* Follow up with customers

---

## 3.2 Salesperson / Staff

Staff can:

* Add walk-in customers
* Save customer preferences
* Share product links
* Assist with try-on sessions
* Create orders
* Update payment and shipping status

Permissions should be controlled by the shop owner.

---

## 3.3 Customer

Customer does not need to install an app.

Customer can:

* Open WhatsApp collection link
* View selected items
* Upload photo for try-on
* Try 1–4 outfits
* Save favorites
* Share with family
* Send enquiry to retailer
* Pay through UPI
* Request home delivery
* Visit store for final fitting

---

# 4. Main Workflow

```text
Retailer uploads new arrivals
↓
AI analyzes each product
↓
AI checks customer history and preferences
↓
AI selects only best-matching products for each customer
↓
Retailer reviews personalized collections
↓
Retailer sends WhatsApp link
↓
Customer opens mobile web page
↓
Customer tries products on own photo
↓
Customer saves favorites or sends enquiry
↓
Retailer receives lead/order
↓
Retailer sends UPI payment details
↓
Customer pays
↓
Retailer ships product
↓
Customer history updates automatically
```

---

# 5. Key Principle

The retailer should **not broadcast all new arrivals to all customers**.

Instead, the system must use AI to match:

```text
Customer Preference
+
Product Attributes
+
Purchase History
+
Budget
+
Occasion
+
Color
+
Style
+
Fit
+
Engagement Behavior
=
Personalized Product Selection
```

Only the best few products should be sent to each customer.

---

# 6. Major Modules

## 6.1 Customer CRM

Stores customer information.

Fields:

```text
Customer Name
Phone Number
WhatsApp Number
Email Optional
Address Optional
City
State
Pincode
Birthday Optional
Anniversary Optional
Preferred Language
Consent Status
Customer Tags
Customer Notes
```

Customer tags:

```text
Premium Customer
Budget Customer
Wedding Buyer
Office Wear Buyer
Cotton Lover
Festival Buyer
Frequent Buyer
Inactive Customer
VIP Customer
```

---

## 6.2 Customer Fashion DNA

Each customer should have a continuously updated preference profile.

### Color Preferences

Track:

```text
Liked colors
Purchased colors
Ignored colors
Wishlist colors
Try-on colors
Avoided colors
```

Example:

```text
High Preference:
- Pastel Pink
- Maroon
- Navy Blue

Medium Preference:
- Lavender
- Peach

Low Preference:
- Neon Green
- Bright Orange
```

---

### Style Preferences

Track:

```text
Traditional
Modern
Indo-Western
Office Wear
Party Wear
Daily Wear
Festive Wear
Wedding Wear
Heavy Embroidery
Minimal Design
Designer Wear
Premium Wear
```

---

### Fabric Preferences

Track:

```text
Cotton
Rayon
Georgette
Silk
Chiffon
Linen
Velvet
Crepe
Organza
Net
```

---

### Occasion Preferences

Track:

```text
Office
Daily Wear
Wedding
Festival
Party
Family Function
College
Religious Event
Birthday
Anniversary
Seasonal Shopping
```

---

### Budget Profile

The system should learn customer spending behavior.

Example:

```text
Usually Buys: ₹1500–₹2500
Sometimes Buys: ₹2500–₹5000
Rarely Buys: ₹5000+
Never Recommended: ₹10000+
```

---

### Fit and Size Profile

Optional and consent-based.

Fields:

```text
Preferred Size
Height Optional
Body Type Optional
Sleeve Preference
Length Preference
Fit Preference
Alteration Notes
```

This must never be forced.

---

### Shopping Behavior

Track:

```text
Last Purchase Date
Average Order Value
Preferred Shopping Season
Responds to WhatsApp
Usually Tries Before Buying
Usually Shares With Family
Waits For Discounts
Buys Premium Items
Visits Store Often
Orders Remotely
```

---

# 7. Product Intelligence

Every uploaded product should be converted into a structured AI product profile.

## Product Fields

```text
Product Name
Design Number
Category
Subcategory
Fabric
Color
Secondary Color
Pattern
Embroidery
Occasion
Style
Season
Price
Discount Price
Available Sizes
Available Colors
Stock Status
Rack/Shelf Location
Product Images
Try-On Eligible
```

---

## AI-Generated Product Tags

Example:

```text
Pink
Cotton
Office Wear
Pastel
Minimal
Summer
Daily Wear
Budget Friendly
Unstitched Suit
Elegant
```

---

# 8. AI Matching Engine

This is the most important system.

When retailer uploads new arrivals, AI should compare every product against every eligible customer.

## Matching Criteria

```text
Color Match
Style Match
Fabric Match
Budget Match
Occasion Match
Size/Fit Match
Season Match
Previous Purchase Match
Wishlist Match
Try-On History Match
Brand Preference Match
Engagement Probability
```

---

## Match Score Example

```text
Customer: Priya Sharma
Product: Pastel Pink Cotton Office Suit

Color Match: 96%
Fabric Match: 92%
Budget Match: 98%
Occasion Match: 95%
Style Match: 91%
Fit Match: 88%

Overall Match Score: 94%
```

---

## Recommendation Rules

The system should not send too many products.

Suggested limits:

```text
Normal Customer: 5–7 products
VIP Customer: 8–12 products
Inactive Customer: 3–5 products
Premium Customer: 5–10 products
```

---

## Diversity Rule

Do not send only same-looking products.

Example:

If customer likes pink cotton suits:

```text
Send:
3 Pink Cotton
1 Peach Cotton
1 Lavender Cotton
1 Premium Linen
1 Festival Variant
```

This keeps recommendations useful but not repetitive.

---

## Exclusion Rules

Do not recommend:

```text
Already purchased same product
Out-of-stock item
Wrong size
Far above budget
Rejected style
Ignored product category
Same item sent recently
Product with poor image quality
Unverified AI color variant
```

---

# 9. AI Curated Collection

Retailer should not create campaigns manually every time.

Instead:

```text
New arrivals uploaded
↓
AI creates customer-specific collections
↓
Retailer reviews
↓
Retailer approves
↓
System sends WhatsApp links
```

---

## Collection Example

Message to customer:

```text
Hello Priya ji,

We selected 6 new suits for you based on your previous choices:

- Pastel colors
- Cotton fabric
- Office wear style
- ₹2000–₹3000 budget

You can try them on your photo here:
[Open Collection]
```

---

# 10. Customer Mobile Web Experience

Customer does not install app.

They open a mobile web link.

## Customer Screens

```text
Welcome Page
Collection Page
Product Detail
Upload Photo
Try-On Preview
Compare Looks
Favorites
Share With Family
Send Enquiry
Buy on WhatsApp
Payment Instructions
Delivery Address
Order Status
```

---

## Customer Collection Page

Shows:

```text
Retailer branding
Customer name
Personalized message
Selected products
Price
Available colors
Try-on button
WhatsApp enquiry button
Store visit button
Delivery option
```

---

# 11. Remote AI Try-On

Customer can try outfits from home.

## Try-On Flow

```text
Customer opens collection
↓
Selects product
↓
Uploads full-body photo
↓
Accepts consent
↓
AI generates try-on image
↓
Customer views result
↓
Customer saves, shares, or enquires
```

---

## Try-On Limits

MVP should limit try-ons to control cost.

Example:

```text
Free customer link: 3 try-ons
VIP customer link: 10 try-ons
Retailer paid plan: configurable limit
```

---

## Try-On Privacy

Important rules:

```text
Customer photo should not be visible to retailer by default
Customer photo should auto-delete
Try-on result should expire
Customer must give consent before saving
Retailer can only see result if customer shares it
```

---

# 12. Family Sharing Feature

Customer can share try-on previews with:

```text
Mother
Sister
Friend
Husband
Daughter
Family WhatsApp Group
```

This is important for Indian shopping behavior.

Shared page should include:

```text
Product image
Try-on image
Price
Retailer contact
Vote / Like option
```

Future feature:

```text
Family voting:
- Like
- Not good
- Try another color
```

---

# 13. WhatsApp Commerce

WhatsApp is the main communication channel.

## Retailer Can Send

```text
Personalized collection
New arrival shortlist
Try-on link
Product detail
UPI QR
Payment reminder
Order confirmation
Tracking details
Festival collection
Price drop alert
Back-in-stock alert
```

---

## Customer Can Reply

```text
Interested
Need more colors
Try this on me
Book this item
Send payment QR
Need delivery
Will visit store
```

---

## MVP WhatsApp Method

Start with manual WhatsApp share.

Later integrate:

```text
WhatsApp Business API
Message templates
Automated replies
Broadcast permissions
Delivery/read tracking
```

---

# 14. Payment Module

Retailer can save payment details.

## Retailer Payment Profile

```text
UPI ID
UPI QR Code
Bank Account Optional
Shop Name
Payment Instructions
Refund Policy
Payment Confirmation Notes
```

---

## Customer Payment Flow

```text
Customer selects product
↓
Retailer sends UPI QR/link
↓
Customer pays
↓
Customer uploads payment screenshot or sends on WhatsApp
↓
Retailer marks payment received
↓
Order moves to packing/shipping
```

---

## MVP Payment Rule

Do not store sensitive card data.

MVP should support:

```text
UPI QR
UPI ID
Manual payment confirmation
Payment screenshot
Cash
Bank transfer
```

Payment gateway integration can come later.

---

# 15. Order Management

## Order Statuses

```text
Enquiry
Confirmed
Payment Pending
Paid
Packed
Shipped
Delivered
Cancelled
Returned
Refunded
```

---

## Order Fields

```text
Order ID
Customer ID
Retailer ID
Product IDs
Selected Variants
Quantity
Price
Discount
Shipping Charge
Total Amount
Payment Status
Payment Method
Payment Screenshot
Delivery Address
Courier Name
Tracking Number
Order Notes
Created By
Created At
```

---

# 16. Shipping Module

## MVP Shipping

Retailer manually enters:

```text
Courier Name
Tracking Number
Shipping Date
Expected Delivery Date
Delivery Notes
```

---

## Future Shipping Integrations

```text
Shiprocket
Delhivery
DTDC
India Post
Blue Dart
Ekart
Xpressbees
```

---

# 17. Customer Consent System

Consent must be explicit.

## Consent Types

```text
Save phone number
Send WhatsApp messages
Save address
Save purchase history
Save try-on result
Save photo for future try-on
Marketing communication
```

Each consent should have:

```text
Consent type
Accepted / declined
Timestamp
Source
IP/device info
Revocation status
```

---

# 18. Data Retention Policy

Recommended defaults:

```text
Customer photo: delete after 24 hours
Try-on result: delete after 7 days unless saved
Collection link: expire after 7–30 days
Payment screenshot: retain for accounting period
Customer profile: retain until deleted/requested
```

Retailer should be able to delete customer data.

---

# 19. Retailer AI Assistant

Retailer can ask natural language commands.

Examples:

```text
Send cotton new arrivals to customers who like office wear.
Show customers who liked pink suits but did not buy.
Create a Diwali collection for premium customers.
Find customers who have not purchased in 6 months.
Show customers who usually buy under ₹2500.
Create WhatsApp message for wedding collection.
```

AI should generate:

```text
Customer segment
Product selection
Message draft
Preview
Approval screen
```

Retailer must approve before sending.

---

# 20. AI Personal Stylist

Customer-facing AI assistant.

## Customer Can Ask

```text
Show me something for office.
Suggest something for my sister’s wedding.
Find suits like the pink one I bought last time.
Show only cotton under ₹2500.
Which of these looks best on me?
Suggest something different from my usual style.
```

---

## AI Stylist Should Use

```text
Customer Fashion DNA
Retailer catalog
Available stock
Budget
Occasion
Past purchases
Saved items
Try-on history
```

---

# 21. Digital Wardrobe

With consent, customer can maintain a history of purchased products.

## Digital Wardrobe Includes

```text
Purchased outfits
Favorite colors
Occasions purchased for
Style history
Matching suggestions
Repeat purchase avoidance
Accessory suggestions
```

Example:

```text
Customer asks:
Show me a dupatta that matches the blue suit I bought last Diwali.

AI searches wardrobe and recommends matching items.
```

---

# 22. Customer Segmentation

System should auto-create segments.

## Examples

```text
Cotton Suit Buyers
Wedding Customers
Festival Buyers
Premium Buyers
Budget Buyers
Inactive Customers
High Engagement Customers
Wishlist But No Purchase
Try-On But No Purchase
Pastel Color Lovers
Maroon Suit Buyers
Office Wear Customers
```

---

# 23. Campaign System

Campaigns should be AI-assisted.

## Campaign Types

```text
New Arrival Curated Collection
Festival Collection
Wedding Season Collection
Price Drop
Back in Stock
Birthday Offer
Anniversary Offer
Inactive Customer Reactivation
Wishlist Reminder
Try-On Follow-Up
```

---

## Campaign Flow

```text
Retailer creates campaign
↓
AI selects customers
↓
AI selects products per customer
↓
AI generates message
↓
Retailer reviews
↓
Retailer sends
↓
System tracks engagement
```

---

# 24. Analytics

Retailer dashboard should show:

```text
Total customers
Active customers
Products shared
Collections opened
Try-ons generated
Favorites saved
WhatsApp enquiries
Orders created
Payments received
Revenue
Top colors
Top styles
Most tried products
Most purchased products
Customers likely to buy
Inactive customers
```

---

# 25. Technical Architecture

## Frontend

```text
Retailer App: React Native / Flutter
Customer Web App: Next.js / React
Retailer Dashboard: Next.js
Display Mode: Next.js
Admin Panel: Next.js
```

---

## Backend

```text
API Server: NestJS or FastAPI
Database: PostgreSQL
File Storage: Cloudflare R2 / AWS S3
Queue: Redis + BullMQ / Celery
Search: Typesense / Meilisearch
Vector Search: Qdrant
AI Workers: Python
Realtime: WebSocket / Supabase Realtime
Auth: Phone OTP
Payments: UPI first, Razorpay later
WhatsApp: Manual share first, API later
```

---

# 26. Core Services

## Services

```text
Auth Service
Retailer Service
Customer CRM Service
Product Service
Catalog Service
Recommendation Service
Try-On Service
WhatsApp Share Service
Order Service
Payment Service
Shipping Service
Consent Service
Analytics Service
Notification Service
AI Agent Service
```

---

# 27. Database Tables

## Main Tables

```text
organizations
users
staff_members
customers
customer_addresses
customer_consents
customer_preferences
customer_fashion_dna
products
product_variants
product_images
collections
collection_items
customer_collections
tryon_sessions
tryon_results
wishlists
orders
order_items
payments
shipments
campaigns
campaign_recipients
ai_recommendations
ai_jobs
audit_logs
```

---

# 28. Security Requirements

```text
OTP login
Role-based access control
Signed image URLs
Private customer photos
Encrypted sensitive data
Auto-delete temporary images
Audit logs
Rate limiting
Staff permission levels
Secure payment proof storage
Consent-based marketing
Customer data export/delete
```

---

# 29. Staff Permissions

## Owner

Can access everything.

## Manager

Can manage products, customers, orders, campaigns.

## Salesperson

Can add customers, create sessions, share products, create orders.

## Viewer

Can only view catalog and customer requests.

---

# 30. MVP Scope

## Must Have

```text
Retailer login
Customer CRM
Product upload
AI product tagging
Customer Fashion DNA basic version
AI curated product selection
Personalized WhatsApp collection link
Customer mobile web catalog
Customer photo upload
Remote AI try-on
Favorites
Enquiry to retailer
Retailer UPI QR/payment details
Manual order creation
Manual shipping status
Consent and auto-delete
```

---

## Should Not Build in MVP

```text
Full inventory ERP
Full marketplace
Manufacturer network
Wholesaler network
Custom AI model training
Advanced payment gateway
Automated WhatsApp Business API
Shipping API integration
Family closet
Advanced loyalty system
```

These should come later.

---

# 31. MVP Development Phases

## Phase 1 — CRM + Product Catalog

Build:

```text
Retailer login
Shop profile
Customer profile
Product upload
Product list
Product detail
Basic tags
Customer notes
```

---

## Phase 2 — Personalized Collections

Build:

```text
Customer preference profile
AI product matching
Curated collection generator
Collection link
WhatsApp share
Collection open tracking
```

---

## Phase 3 — Remote Try-On

Build:

```text
Customer upload photo
Try-on consent
Try-on API integration
Try-on result page
Compare 3–4 products
Auto-delete system
```

---

## Phase 4 — Orders + UPI

Build:

```text
Create order
Send UPI QR
Payment pending/received
Payment screenshot
Order status
Delivery address
Shipping tracking field
```

---

## Phase 5 — AI Stylist + Follow-Up

Build:

```text
AI personal stylist
Wishlist
Follow-up reminders
Price drop alert
Back-in-stock alert
Inactive customer campaign
```

---

# 32. Success Criteria

The MVP is successful if a retailer can:

```text
Add 100 products
Add 100 customers
Generate personalized collections
Send selected products through WhatsApp
Customer opens link without app
Customer tries product on own photo
Customer sends enquiry
Retailer collects UPI payment
Retailer ships product
System updates customer preference automatically
```

---

# 33. Long-Term Vision

The platform can later expand into:

```text
Retailer in-store AI assistant
Large display try-on
Wholesaler catalog network
Manufacturer catalog distribution
AI fashion marketplace
Personal shopper AI
Family wardrobe
Multi-store retailer system
Automated WhatsApp commerce
Integrated shipping
Integrated payments
Advanced analytics
AI demand forecasting
```

---

# 34. Final Architecture Principle

Build the platform around this rule:

```text
Do not send more products.
Send better-matched products.
```

The winning feature is not virtual try-on alone.

The winning feature is:

```text
AI understands each customer
AI understands each product
AI matches the right products
Customer tries from home
Retailer sells through WhatsApp
Customer relationship keeps improving
```
