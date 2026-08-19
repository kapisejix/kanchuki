--- E:\Kanchuki/apps/api/src/routes/checkout/checkout-flow.ts
+++ E:\Kanchuki/apps/api/src/routes/checkout/checkout-flow.ts
@@ -18,6 +18,7 @@
 import {
   decryptSecret,
   encryptSecret,
   maskSecret,
   prisma,
+  generateAndAttachInvoicePdf,
 } from '@kanchuki/db';
 // Auto-split from checkout.ts (scripts/split-checkout-routes.mjs) — route bodies verbatim.
 import { isValidIndianPhone } from '@kanchuki/shared';
@@ -202,6 +203,11 @@
 await prisma.order.update({
   where: { id: result.order.id },
   data: { razorpay_order_id: razorpayOrder.id },
 });
+
+  try {
+    await generateAndAttachInvoicePdf(result.order.id);
+  } catch (error) {
+    request.log.error({ error: error as Error, orderId: result.order.id }, 'Failed to generate and attach invoice PDF');
+ }
 request.log.info(
   { order_id: result.order.id, razorpay_order_id: razorpayOrder.id },
   'Order created',
 );