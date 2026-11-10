/**
 * BUILT-IN PAGE CONTENT DEFAULTS — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 * Regenerate with:  node /home/z/my-project/scripts/gen-page-defaults.mjs
 *
 * Sources (storefront wording mirrored 1:1, so seeding/enabling the CMS never
 * changes the live pages until an admin edits them):
 *   - apps/storefront/src/lib/policies.ts               → shipping, returns, privacy, terms
 *   - apps/storefront/src/lib/faq-content.ts            → faq entries
 *   - apps/storefront/src/app/(shop)/faq/faq-explorer.tsx → faq intro paragraph
 *   - apps/storefront/src/app/(shop)/about/page.tsx     → our-story
 *   - apps/storefront/src/app/(shop)/contact/page.tsx   → contact
 *
 * Mechanical adaptations applied by the generator (no wording changes):
 *   - note/banner block icons dropped (CMS blocks carry no icon field)
 *   - cards item `tone` dropped (CMS carries no tone field)
 *   - policy `contactPanel` → cta { label: "Contact our support team",
 *     href: "/contact", note: <panel text> }
 *   - FAQ entry DOM ids dropped (CMS FaqEntry is {category, question, answer})
 *   - our-story decorative badges/card numbers dropped; contact page excludes
 *     the FAQ accordion, form labels and runtime contact channels.
 */

import type { PageContent } from "@annaadhya/contracts";

/** Defaults for built-in storefront pages. Content mirrors the current
 *  hard-coded storefront wording 1:1 so enabling the CMS never changes the
 *  live pages until an admin edits them. */
export interface BuiltinPageDefault {
  slug: string; // e.g. "our-story", "faq", "shipping", "returns", "privacy", "terms", "contact"
  title: string; // page title as rendered
  pageType: "document" | "faq";
  content: PageContent;
  seo?: { title?: string; description?: string };
}

/* ============================== our-story ============================== */

const OUR_STORY_PAGE: BuiltinPageDefault = {
  "slug": "our-story",
  "title": "Our Story",
  "pageType": "document",
  "content": {
    "kind": "document",
    "lede": "Discover a thoughtful collection of pantry treasures inspired by India’s rich food heritage, where everyday rituals, beautiful ingredients, and the joy of sharing come together.",
    "sections": [
      {
        "id": "story",
        "eyebrow": "The Story of Annaadhya",
        "title": "Rooted in Tradition. Chosen with Care.",
        "blocks": [
          {
            "type": "image",
            "src": "/images/hero-pantry-still-life.webp",
            "alt": "Annaadhya pantry composition with raw wildflower honey, saffron and premium nuts on handmade paper",
            "caption": "Inspired by Indian Heritage · Harvest Reserve"
          },
          {
            "type": "cta",
            "label": "Explore Our Pantry",
            "href": "/shop",
            "note": "Heirloom Recipes & Rare Harvests"
          }
        ]
      },
      {
        "id": "philosophy",
        "eyebrow": "Our Philosophy",
        "title": "More Than What’s in the Jar.",
        "blocks": [
          {
            "type": "paragraph",
            "text": "We believe the things we bring into our homes deserve a little more thought. From the ingredients we keep close to the way we share a gift, every choice can make an ordinary moment feel more considered."
          },
          {
            "type": "paragraph",
            "text": "In an era of rushed conveniences, Annaadhya pauses to venerate slow culinary practices—the gentle golden trickle of raw wild forest honey, the fragrant unspooling of Kashmiri Mongra saffron threads in warm milk, and the earthy richness of raw Mamra almonds."
          },
          {
            "type": "image",
            "src": "/images/story-heritage-kitchen.webp",
            "alt": "Sunlit Indian kitchen scene with a brass thali, earthenware and soft jali window light",
            "caption": "Honoring quiet morning rituals and generational kitchen traditions."
          },
          {
            "type": "cards",
            "cols": 2,
            "items": [
              {
                "title": "Verified",
                "text": "Every claim published with supplier documents behind it"
              },
              {
                "title": "Ritual",
                "text": "Consciously chosen for daily moments"
              }
            ]
          }
        ]
      },
      {
        "id": "collections",
        "eyebrow": "Collection Essentials",
        "title": "A Pantry Inspired by India’s Richness",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Culinary staples harvested with reverence, celebrating the textures, aromas, and stories of regions steeped in harvest wisdom."
          },
          {
            "type": "cards",
            "cols": 2,
            "items": [
              {
                "title": "Wild & Floral Honey",
                "text": "Warm golden hues, natural textures, and quiet sweetness for daily morning rituals."
              },
              {
                "title": "Kashmiri Mongra Saffron",
                "text": "Deep crimson threads hand-culled for their delicate aroma and regal golden colour."
              },
              {
                "title": "Sun-Dried Nuts & Dry Fruits",
                "text": "Whole Mamra almonds, plump cashews, and rich pistachios for everyday nourishment."
              },
              {
                "title": "Bespoke Festive Hampers",
                "text": "Thoughtfully composed assortments in keepsake velvet boxes, designed for heartfelt occasions."
              }
            ]
          },
          {
            "type": "cta",
            "label": "Discover Honey",
            "href": "/category/honey"
          },
          {
            "type": "cta",
            "label": "Discover Kesar",
            "href": "/category/kesar"
          },
          {
            "type": "cta",
            "label": "Discover Dry Fruits",
            "href": "/category/dry-fruits"
          },
          {
            "type": "cta",
            "label": "Discover Hampers",
            "href": "/category/gift-boxes"
          }
        ]
      },
      {
        "id": "what-guides-us",
        "eyebrow": "Core Values",
        "title": "What Guides Us",
        "blocks": [
          {
            "type": "paragraph",
            "text": "Every product in our pantry stands upon principles that prioritize integrity, mindful savoring, and honest relationships."
          },
          {
            "type": "cards",
            "cols": 2,
            "items": [
              {
                "title": "Thoughtful Selection",
                "text": "We value choosing pantry essentials with care and consideration, never compromising on character or provenance."
              },
              {
                "title": "Everyday Rituals",
                "text": "We celebrate the small moments that make food part of how we live, pause, reconnect, and nourish our families."
              },
              {
                "title": "The Joy of Sharing",
                "text": "We believe a thoughtfully chosen gift can bridge distances and make any celebration feel deeply personal."
              },
              {
                "title": "Respect for Tradition",
                "text": "We draw inspiration from India’s timeless culinary heritage while tailoring a considered, contemporary experience."
              }
            ]
          }
        ]
      },
      {
        "id": "art-of-giving",
        "eyebrow": "The Art of Giving",
        "title": "Some Things Are Better Shared.",
        "blocks": [
          {
            "type": "paragraph",
            "text": "A thoughtfully chosen gift can turn a simple gesture into a lasting memory. Our world of pantry treasures and gift hampers is inspired by the pleasure of giving something warm, meaningful, and made to be enjoyed."
          },
          {
            "type": "paragraph",
            "text": "Each hamper is hand-assembled in keepsake velvet boxes with gold embossing, pairing golden wild honeys with Mamra almonds and Kashmiri saffron."
          },
          {
            "type": "cta",
            "label": "Explore Gift Hampers",
            "href": "/category/gift-boxes"
          },
          {
            "type": "image",
            "src": "/images/gifting-royal-hamper.webp",
            "alt": "Handcrafted royal maroon keepsake box with honey jars, a saffron tin and assorted premium nuts"
          }
        ]
      },
      {
        "id": "our-promise",
        "eyebrow": "Our Commitment",
        "title": "A More Thoughtful Way to Shop.",
        "blocks": [
          {
            "type": "paragraph",
            "text": "From discovering something special to placing an order, we want your experience with Annaadhya Products to feel clear, considered, and welcoming."
          },
          {
            "type": "cards",
            "cols": 3,
            "items": [
              {
                "title": "A Considered Selection",
                "text": "Pantry essentials chosen for their craftsmanship, regional balance, natural character, and quiet culinary distinction."
              },
              {
                "title": "A Welcoming Experience",
                "text": "Honest presentation, transparent details, and responsive care from our team — effortless exploration from our pantry to your table."
              },
              {
                "title": "Thoughtful Sharing & Gifting",
                "text": "Distinctive festive presentations, protective transit packaging, and personalized touches that turn gifts into cherished keepsakes."
              }
            ]
          }
        ]
      },
      {
        "id": "bring-it-home",
        "eyebrow": "Artisanal Pantry",
        "blocks": [
          {
            "type": "banner",
            "title": "Bring Something Thoughtful Home.",
            "text": "Explore pantry favourites and gifts chosen for the moments worth savouring."
          },
          {
            "type": "cta",
            "label": "Explore Our Collection",
            "href": "/shop"
          },
          {
            "type": "cta",
            "label": "Get in Touch",
            "href": "/contact"
          }
        ]
      }
    ]
  },
  "seo": {
    "description": "The story behind Annaadhya Products — a thoughtful Indian pantry of honey, Kashmiri kesar, dry fruits and festive hampers, curated for everyday rituals and meaningful gifting."
  }
};

/* ================================= faq ================================= */

const FAQ_PAGE: BuiltinPageDefault = {
  "slug": "faq",
  "title": "FAQ",
  "pageType": "faq",
  "content": {
    "kind": "faq",
    "intro": "From choosing your pantry favourites to tracking your order, find clear, thoughtful answers to the questions our customers ask most.",
    "entries": [
      {
        "category": "orders",
        "question": "How can I place an order?",
        "answer": "Browse [the shop](/shop), pick a product and the pack size you want, then add it to your bag and check out. Totals are calculated on our servers — the price you see at checkout is the price you pay — and the moment your order is confirmed you'll have an order number and the full details saved under [Account → Orders](/account/orders)."
      },
      {
        "category": "orders",
        "question": "Where can I find my order details?",
        "answer": "Every order lives under [Account → Orders](/account/orders): status, items, totals and — once it's shipped — the courier's tracking link, kept current as the parcel moves. If you checked out as a guest, your confirmation page holds the order details; if you've lost it, [contact us](/contact) with your order number and we'll help."
      },
      {
        "category": "orders",
        "question": "Can I change or cancel an order after placing it?",
        "answer": "You can cancel an unpaid or not-yet-dispatched order from [your account](/account) or by [contacting us](/contact) with your order number; prepaid orders cancelled before dispatch are refunded in full to the original payment method within 5–7 working days (gateway processing times apply). For changes to items or the delivery address, reach out as early as you can — what's possible depends on how far the order has already gone."
      },
      {
        "category": "orders",
        "question": "I haven't received an order confirmation. What should I do?",
        "answer": "You don't have to wait on an email: your order number, status and items are recorded under [Account → Orders](/account/orders) the moment checkout completes. If the order isn't showing there at all — or you ordered as a guest and lost the confirmation page — [contact us](/contact) with the payment reference and we'll track it down."
      },
      {
        "category": "shipping",
        "question": "Where can I find information about shipping and delivery?",
        "answer": "Our [shipping & delivery policy](/policies/shipping) has the full detail. In short: orders dispatch within 2–3 working days of payment confirmation, delivery typically takes 3–7 working days after dispatch depending on your pincode, and any shipping charge — or the free-shipping threshold — is shown at checkout before you pay. If a pincode isn't serviceable, checkout tells you before payment."
      },
      {
        "category": "shipping",
        "question": "How can I track my order?",
        "answer": "Once your order is shipped, the courier's tracking link and the current status appear on the order under [Account → Orders](/account/orders). That page is always the fastest place to check where your parcel is. If tracking hasn't appeared within the 2–3 working day dispatch window, [contact us](/contact) with your order number."
      },
      {
        "category": "shipping",
        "question": "What should I do if my delivery is delayed?",
        "answer": "Delivery estimates are planning figures, not guarantees — weather, holiday backlogs and remote-pincode routing can add delays outside our control. Start with the tracking link on your order under [Account → Orders](/account/orders). If the parcel looks stuck or is well past the estimated window, [contact us](/contact) with your order number and we'll follow it up with the courier."
      },
      {
        "category": "shipping",
        "question": "What should I do if my package arrives damaged?",
        "answer": "We pack to withstand normal transit, but if a parcel arrives damaged, contact us within 48 hours of delivery with your order number and photographs of the outer carton and the damaged items. Approved cases are put right in full — including shipping — under our [returns & refunds policy](/policies/returns)."
      },
      {
        "category": "payments",
        "question": "How can I pay for my order?",
        "answer": "Checkout offers online payment through our secure payment gateway (UPI, cards, net banking and wallets once Razorpay is live) and Cash on Delivery where it's enabled. Right now the store runs a simulated gateway in demo mode: orders complete end-to-end but no real money moves, and Razorpay switches on automatically once its API keys are configured. Card details are handled entirely by the gateway — we never see or store them."
      },
      {
        "category": "payments",
        "question": "What should I do if my payment fails?",
        "answer": "If an authorisation fails, your items stay in your bag. Check with your bank app, then retry or pick a different payment method — and avoid repeat attempts if your bank shows the money leaving, so you don't get charged twice. Still stuck after a couple of tries? [Contact us](/contact) with what you're seeing and we'll help you sort it out."
      },
      {
        "category": "payments",
        "question": "My payment was deducted, but my order status is unclear. What should I do?",
        "answer": "Don't place a duplicate order yet. Note the transaction reference from your bank or UPI app (the UTR or reference number), then [contact us](/contact) with it and the amount — we'll check it against our payment records and confirm your order status. We reply within one working day, Monday to Saturday."
      },
      {
        "category": "products",
        "question": "What kinds of products does Annaadhya Products offer?",
        "answer": "Our pantry is built around [honey](/category/honey), [dry fruits](/category/dry-fruits) and [kesar (saffron)](/category/kesar), with a growing [gift hampers](/category/gift-boxes) line for festivals and gifting. Every product page states its pack sizes, price and an honest description of the batch on sale — including what's verified and what's still pending verification."
      },
      {
        "category": "products",
        "question": "How can I learn more about a product?",
        "answer": "Each [product page](/shop) says exactly what is known about the batch being sold — and what is still pending. We don't use words like 'pure' or 'organic' as marketing labels: when a batch has test documentation, the page states what was tested and by whom. If something isn't clear, choose Product Question in our [contact form](/contact) and we'll follow up."
      },
      {
        "category": "products",
        "question": "How can I check product availability?",
        "answer": "Stock is shown plainly on each product page — variants are marked in stock or out of stock, low batches are flagged, and sold-out sizes can't be added to the bag. There are no artificial countdowns or scarcity theatre; what the [shop](/shop) shows is what's genuinely on sale."
      },
      {
        "category": "products",
        "question": "Where can I find product-specific certifications?",
        "answer": "We publish quality information on the product page itself — what has been tested, by whom, and what documentation is still pending — and we don't claim certifications we can't show. Licence and certification details are being finalised with the business and will be published as they're confirmed. Questions about a specific batch? Choose Product Question in the [contact form](/contact)."
      },
      {
        "category": "returns",
        "question": "What is the return policy?",
        "answer": "Because we sell food, returns are accepted only for genuine quality issues, damaged shipments or wrong items — not for change of mind on opened products. Contact us within 48 hours of delivery with your order number and photographs; approved returns are refunded fully, including shipping. The complete wording is in our [returns & refunds policy](/policies/returns)."
      },
      {
        "category": "returns",
        "question": "How can I ask about a refund?",
        "answer": "Prepaid orders cancelled before dispatch are refunded in full to the original payment method within 5–7 working days (gateway processing times apply), and approved returns are refunded the same way, including shipping. To ask about a refund, [contact us](/contact) with your order number and what happened — we'll review it against the [returns policy](/policies/returns) and reply within one working day, Monday to Saturday."
      },
      {
        "category": "returns",
        "question": "What should I do if I receive the wrong item?",
        "answer": "We're sorry when that happens. Contact us within 48 hours of delivery with your order number and a photo of what arrived; wrong items fall under approved returns, so they're refunded fully including shipping under our [returns & refunds policy](/policies/returns)."
      },
      {
        "category": "gifts",
        "question": "Can I explore gift hampers?",
        "answer": "Yes — our [Gift Hampers](/category/gift-boxes) collection brings together our honeys, saffron and dry fruits in keepsake packaging for festivals, weddings and heartfelt moments. Exact contents and box formats are finalised with our gifting team, so for custom orders, [enquire about gifting](/contact?enquiry=Gifting%20or%20Business%20Enquiry) with the occasion, budget and quantity."
      },
      {
        "category": "gifts",
        "question": "How can I ask about gifting or bulk enquiries?",
        "answer": "Choose Gifting or Business Enquiry in our [contact form](/contact?enquiry=Gifting%20or%20Business%20Enquiry) and tell us the occasion, the budget per gift and the quantity — we respond with what we can genuinely offer, within one working day, Monday to Saturday."
      },
      {
        "category": "account",
        "question": "Do I need an account to shop?",
        "answer": "No — guest checkout is available, so you can order without signing in. A free account still makes life easier: your address book, order history and courier tracking sit in one place under [Account](/account), which makes reordering and support quicker. You can create one from the [sign-in page](/account/login) whenever you like."
      },
      {
        "category": "account",
        "question": "How can I access my account?",
        "answer": "Use the person icon in the header or go straight to the [sign-in page](/account/login). You can continue with Google, or sign in with the email address and password you registered — sign-in is handled by Google Firebase Authentication and we never store passwords."
      },
      {
        "category": "account",
        "question": "I'm having trouble signing in. What should I do?",
        "answer": "Double-check the email address you registered with first. If you use Continue with Google, make sure your browser isn't blocking pop-ups — the Google sign-in window opens in one. Still locked out? [Contact us](/contact) with the email you're trying and we'll help you get back in."
      }
    ]
  },
  "seo": {
    "description": "Honest answers about ordering, shipping, payments, products, returns and gifting at Annaadhya Products — matching our published policies."
  }
};

/* ======================== policies (mechanical) ======================== */

const POLICY_PAGES: BuiltinPageDefault[] = [
  {
    "slug": "shipping",
    "title": "Shipping & Dispatch Policy",
    "pageType": "document",
    "content": {
      "kind": "document",
      "lede": "Find information about how orders are prepared for dispatch, how delivery information is shared, and where to look for help with a shipment.",
      "sections": [
        {
          "id": "overview",
          "eyebrow": "01 • Charter",
          "title": "Dispatch Overview",
          "toc": "1. Dispatch Overview",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We currently ship across India. Every order is prepared after your payment is confirmed, and parcels leave us within **2–3 working days** — a window we publish openly rather than promise secretly."
            },
            {
              "type": "paragraph",
              "text": "Because these are natural pantry goods, we pack to withstand normal transit conditions. This policy explains how orders move from confirmation to your doorstep, what the delivery estimates mean, and what to do if something goes wrong."
            },
            {
              "type": "cards",
              "cols": 3,
              "items": [
                {
                  "icon": "clock",
                  "title": "Honest Timelines",
                  "text": "Delivery estimates are planning figures — guidance, not guarantees."
                },
                {
                  "icon": "package",
                  "title": "Protective Packing",
                  "text": "Parcels are packed to withstand normal transit conditions."
                },
                {
                  "icon": "mapPin",
                  "title": "Pre-Payment Checks",
                  "text": "If a pincode cannot be served, checkout tells you before you pay."
                }
              ]
            }
          ]
        },
        {
          "id": "order-processing",
          "eyebrow": "02 • Preparation",
          "title": "Order Processing & Packing",
          "toc": "2. Order Processing & Packing",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Here is what happens between the moment you pay and the moment your parcel is handed to a courier partner:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Payment Confirmation:",
                  "text": "an order is accepted when we confirm it after successful payment verification. Until then nothing is packed or charged for dispatch."
                },
                {
                  "title": "Preparation & Dispatch:",
                  "text": "orders are dispatched within **2–3 working days** of payment confirmation."
                },
                {
                  "title": "Cancellation Window:",
                  "text": "you may cancel an unpaid or not-yet-dispatched order from your account page or by contacting support — the window closes when the parcel is dispatched."
                }
              ],
              "icon": "check"
            },
            {
              "type": "note",
              "title": "Natural batch variation:",
              "text": "our products are natural and vary from batch to batch in colour, texture and aroma. Product pages state what is verified and what is pending verification — packing never changes what is inside the jar."
            }
          ]
        },
        {
          "id": "shipping-delivery-info",
          "eyebrow": "03 • Logistics & Transit",
          "title": "Shipping & Delivery Timelines",
          "toc": "3. Shipping Timelines & Pan-India",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Delivery is handled by our courier partners. The windows below are the honest planning figures we publish — they depend on your pincode and carrier conditions."
            },
            {
              "type": "table",
              "head": [
                "Stage",
                "Window"
              ],
              "rows": [
                [
                  "Dispatch preparation",
                  "2–3 working days from payment confirmation"
                ],
                [
                  "Carrier transit",
                  "3–7 working days after dispatch, depending on your pincode"
                ]
              ],
              "footnote": "*Estimates are a planning figure shown as guidance only, not a guarantee. They commence from dispatch, not from checkout."
            }
          ]
        },
        {
          "id": "shipping-charges",
          "eyebrow": "04 • Tariffs & Complimentary Tier",
          "title": "Shipping Charges & Complimentary Tier",
          "toc": "4. Rates & Complimentary Tier",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We believe in honest, upfront pricing with no surprise fees at checkout. The figures below are read **live from the store's settings** — the same values that power the cart progress card and checkout, so this page can never drift from what you actually pay."
            },
            {
              "type": "shippingTiers"
            }
          ]
        },
        {
          "id": "shipment-tracking",
          "eyebrow": "05 • Transparency",
          "title": "Shipment Tracking & Notifications",
          "toc": "5. Tracking & Notifications",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We do not run automated SMS or email dispatch alerts — so we will not pretend you will get one. What you get instead is a tracking reference that lives on your order, where it can always be found:"
            },
            {
              "type": "cards",
              "cols": 2,
              "items": [
                {
                  "icon": "circleCheck",
                  "title": "Tracking on Your Order Page",
                  "text": "Once a shipment is booked, its courier reference (AWB) is recorded on your order in Your Account, with a Track Shipment button that opens the courier's public tracking page."
                },
                {
                  "icon": "refresh",
                  "title": "Corrections Stay Current",
                  "text": "If the courier reference is ever corrected or added late, the tracking link on your order page always opens the latest one — no stale numbers."
                }
              ]
            },
            {
              "type": "paragraph",
              "text": "You can also paste the AWB number directly into the carrier's own tracking site — the link on your order page goes to exactly that public page."
            }
          ]
        },
        {
          "id": "delivery-issues",
          "eyebrow": "06 • Address & Coverage",
          "title": "Delivery Issues & Non-Serviceable PIN Codes",
          "toc": "6. Remote & Non-Serviceable Hubs",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We endeavour to deliver across India, but occasional local courier conditions mean some remote pincodes may not be serviceable. A few practical habits prevent most delivery issues:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "PIN Code Pre-Check:",
                  "text": "enter your accurate 6-digit PIN code at checkout — if it cannot be served, checkout tells you before payment."
                },
                {
                  "title": "Address Accuracy:",
                  "text": "double-check the full delivery address and an active phone number before paying; couriers use them to reach you."
                },
                {
                  "title": "Parcels Not Arriving:",
                  "text": "if your parcel has not arrived within the estimated window, contact us with your order number and we will check with the courier partner."
                }
              ]
            }
          ]
        },
        {
          "id": "damaged-deliveries",
          "eyebrow": "07 • Transit Guarantee",
          "title": "Incorrect or Damaged Deliveries",
          "toc": "7. Transit Damages (48-Hr Protocol)",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We honour the sanctity of food. Parcels are packed to withstand normal transit conditions, but rough handling can occasionally occur. If your parcel arrives damaged, here is the path we publish:"
            },
            {
              "type": "steps",
              "title": "The 48-Hour Notification Protocol",
              "intro": "If your parcel arrives damaged, contact us **within 48 hours of delivery** — this is the window our returns policy commits to:",
              "items": [
                {
                  "label": "Step 01 • Document",
                  "text": "Capture clear photographs of the outer carton, the shipping label, and the damaged item."
                },
                {
                  "label": "Step 02 • Transmit",
                  "text": "Send them with your order number through our contact page — every enquiry is recorded and reviewed."
                },
                {
                  "label": "Step 03 • Resolution",
                  "text": "Approved cases are refunded in full, including shipping — refunds are recorded through the original payment provider."
                }
              ]
            },
            {
              "type": "paragraph",
              "text": "Kindly keep the original container and shipping box until our team confirms the case is closed."
            }
          ]
        },
        {
          "id": "contact-support",
          "eyebrow": "08 • Direct Touchpoint",
          "title": "Contact and Support",
          "toc": "8. Support & Estate Concierge",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Have a special request, a gifting inquiry, a bulk dispatch schedule, or a question about an order in transit? Our team is one message away:"
            },
            {
              "type": "cta",
              "label": "Contact our support team",
              "href": "/contact",
              "note": "Every enquiry is recorded, and we reply within one working day, Monday to Saturday. Shipping questions arrive pre-tagged so they reach the right desk first."
            }
          ]
        }
      ]
    },
    "seo": {
      "description": "How Annaadhya orders are prepared for dispatch, what delivery estimates mean, what shipping costs, and where to get help with a shipment."
    }
  },
  {
    "slug": "returns",
    "title": "Returns & Refunds Policy",
    "pageType": "document",
    "content": {
      "kind": "document",
      "lede": "Learn how to find information about returns, intact packaging, temperature-sensitive goods, and refund timelines for our single-origin harvests.",
      "sections": [
        {
          "id": "overview",
          "eyebrow": "01 • Charter",
          "title": "Overview & Food-Safety Commitment",
          "toc": "1. Overview & Commitment",
          "blocks": [
            {
              "type": "paragraph",
              "text": "These are food products, so our returns rules are built around **food safety first**. We accept returns only for genuine quality issues, damaged shipments or wrong items — and we say so plainly instead of hiding it in a footnote."
            },
            {
              "type": "paragraph",
              "text": "Cancellations work the other way around: while an order is unpaid or not yet dispatched, cancelling it is always available and painless."
            },
            {
              "type": "cards",
              "cols": 3,
              "items": [
                {
                  "icon": "clock",
                  "title": "48 Hours",
                  "text": "Contact us with photographs within 48 hours of delivery for damage claims."
                },
                {
                  "icon": "badgeCheck",
                  "title": "Full Refund",
                  "text": "Approved returns are refunded fully, including shipping."
                },
                {
                  "icon": "wallet",
                  "title": "5–7 Working Days",
                  "text": "Refunds are recorded through the original payment provider."
                }
              ]
            }
          ]
        },
        {
          "id": "return-eligibility",
          "eyebrow": "02 • Standards",
          "title": "Return Eligibility & Food Safety Standards",
          "toc": "2. Eligibility & Food Safety",
          "blocks": [
            {
              "type": "paragraph",
              "text": "In compliance with basic food-safety logic — and out of respect for every customer who receives a parcel after yours — the following rules apply:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Quality issues, damage or wrong items:",
                  "text": "these are exactly what returns exist for. Contact us within 48 hours of delivery with your order number and photographs."
                },
                {
                  "title": "No change-of-mind returns on opened food:",
                  "text": "we cannot accept returns for change of mind on opened food products — this protects every customer's food safety."
                },
                {
                  "title": "Approved returns:",
                  "text": "refunded fully, including shipping."
                }
              ],
              "icon": "check"
            }
          ]
        },
        {
          "id": "damaged-items",
          "eyebrow": "03 • Resolution",
          "title": "Damaged, Defective, or Incorrect Items",
          "toc": "3. Damaged or Incorrect Items",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Our goods travel in protective transit packaging, but couriers are not gentle everywhere. If something reaches you broken, leaking or simply not what you ordered:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Photographs:",
                  "text": "capture clear photographs of the outer carton and the affected items — these carry your claim."
                },
                {
                  "title": "48-hour window:",
                  "text": "contact us within 48 hours of marked delivery with your order number and the photographs."
                }
              ],
              "icon": "check"
            },
            {
              "type": "note",
              "text": "Please keep the original container, seals and shipping box until we confirm the case is closed — they are part of the record."
            }
          ]
        },
        {
          "id": "resolution-request",
          "eyebrow": "04 • Procedure",
          "title": "How to Submit a Resolution Request",
          "toc": "4. Submitting a Request",
          "blocks": [
            {
              "type": "paragraph",
              "text": "To ensure timely review by our team, please complete these four straightforward steps within 48 hours of marked delivery:"
            },
            {
              "type": "steps",
              "title": "The Resolution Sequence",
              "intro": "Four steps, in this order:",
              "items": [
                {
                  "label": "Step 01 • Document",
                  "text": "Capture 2–3 clear photographs: outer carton, shipping label, and the item as it arrived."
                },
                {
                  "label": "Step 02 • Locate",
                  "text": "Find your order number in Your Account → Orders — every order carries its own reference."
                },
                {
                  "label": "Step 03 • Contact",
                  "text": "Send everything through our contact page with the 'Return or Refund' enquiry type — it arrives pre-tagged for the right desk."
                },
                {
                  "label": "Step 04 • Review",
                  "text": "We review the claim against the published policy and confirm the outcome. A submitted request is a claim under review, not an automatic approval — we will not pretend otherwise."
                }
              ]
            }
          ]
        },
        {
          "id": "refund-timelines",
          "eyebrow": "05 • Timelines",
          "title": "Refund Review & Processing Timelines",
          "toc": "5. Refund Timelines",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Refunds are recorded through the original payment provider. Depending on your bank, refunds reflect in **5–7 working days** — one honest window, not a menu of promises we cannot keep:"
            },
            {
              "type": "table",
              "head": [
                "How you paid",
                "Where the refund goes",
                "Window"
              ],
              "rows": [
                [
                  "Prepaid (payment gateway)",
                  "Original payment method",
                  "5–7 working days"
                ],
                [
                  "Cash on delivery (when enabled)",
                  "Bank transfer to the account you nominate",
                  "5–7 working days"
                ]
              ],
              "footnote": "*Gateway processing times apply on top of our recording step. Prepaid orders cancelled before dispatch are refunded in full to the original payment method."
            }
          ]
        },
        {
          "id": "cancellation",
          "eyebrow": "06 • Cancellation",
          "title": "Order Cancellation Parameters",
          "toc": "6. Cancellation Rules",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We aim to dispatch quickly, so the cancellation window is real but bounded — here is exactly how it behaves:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Unpaid or not-yet-dispatched orders:",
                  "text": "cancel any time from your account page, or by contacting support."
                },
                {
                  "title": "Prepaid orders cancelled before dispatch:",
                  "text": "refunded in full to the original payment method within 5–7 working days."
                },
                {
                  "title": "After dispatch:",
                  "text": "the parcel is on its way — use the 48-hour damage path above if anything is wrong on arrival, or contact us and we will help."
                }
              ],
              "icon": "check"
            }
          ]
        },
        {
          "id": "special-conditions",
          "eyebrow": "07 • Nuances",
          "title": "Items with Special Conditions & Gifting",
          "toc": "7. Special Cases & Gifting",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Certain presents and seasonal harvests carry their own considerations, stated here rather than discovered at checkout:"
            },
            {
              "type": "cards",
              "cols": 2,
              "items": [
                {
                  "icon": "gift",
                  "title": "Gift Orders",
                  "text": "Our curated gift collection is in preparation. Gifting enquiries — including business gifting — are handled through the contact page with the gifting enquiry type."
                },
                {
                  "icon": "sun",
                  "title": "Seasonal Batches",
                  "text": "Natural products vary from batch to batch in colour, texture and aroma; product pages state what is verified and what is pending verification."
                }
              ]
            }
          ]
        },
        {
          "id": "support-escalation",
          "eyebrow": "08 • Direct Touchpoint",
          "title": "Direct Support",
          "toc": "8. Direct Support",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Should a resolution need a human conversation, start with the contact page — there is no hidden escalation maze to navigate:"
            },
            {
              "type": "cta",
              "label": "Contact our support team",
              "href": "/contact",
              "note": "Every enquiry is recorded, and we reply within one working day, Monday to Saturday. Return and refund questions arrive pre-tagged so nothing gets lost in a shared inbox."
            }
          ]
        }
      ]
    },
    "seo": {
      "description": "Cancellation rules, when returns are accepted for food-safety reasons, how to raise a damaged-item claim within 48 hours, and how refunds are processed."
    }
  },
  {
    "slug": "privacy",
    "title": "Privacy Policy",
    "pageType": "document",
    "content": {
      "kind": "document",
      "lede": "This document explains what information the Annaadhya storefront handles when you shop with us, why it is needed, and the choices you have.",
      "sections": [
        {
          "id": "respect",
          "eyebrow": "01 • Charter",
          "title": "Respect for Person, Disclosure and Data Integrity",
          "toc": "1. Respect & Data Integrity",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We collect the minimum needed to run an honest shop: **your name, contact details, delivery addresses and order history** — only what is needed to fulfil your orders and support you."
            },
            {
              "type": "paragraph",
              "text": "This policy is a draft pending business and legal review; the review markers you see on this page are deliberate, and the final version will be reviewed against applicable Indian law before launch."
            }
          ]
        },
        {
          "id": "information-collected",
          "eyebrow": "02 • Sources & Data Types",
          "title": "Information We Collect",
          "toc": "2. Information We Collect",
          "blocks": [
            {
              "type": "cards",
              "cols": 2,
              "items": [
                {
                  "icon": "idCard",
                  "title": "Identity & Delivery Data",
                  "text": "Your name, contact details and delivery addresses — entered by you, used to fulfil your orders."
                },
                {
                  "icon": "wallet",
                  "title": "Order History",
                  "text": "What you bought, when, and how it was paid — kept for support and statutory accounting."
                }
              ]
            },
            {
              "type": "note",
              "text": "We never store passwords. Sign-in is handled by Google Firebase Authentication — when you sign in with Google or by email, we receive your verified identifier and basic profile."
            }
          ]
        },
        {
          "id": "how-used",
          "eyebrow": "03 • Purpose Limitation",
          "title": "How Information Is Used",
          "toc": "3. How Information Is Used",
          "blocks": [
            {
              "type": "list",
              "items": [
                {
                  "title": "Orders:",
                  "text": "to process orders, arrange delivery and provide support."
                },
                {
                  "title": "Trust & safety:",
                  "text": "to prevent fraud and keep accounts secure."
                },
                {
                  "title": "Occasional product news:",
                  "text": "only with your explicit opt-in — and you can opt out anytime from your account."
                }
              ],
              "icon": "check"
            },
            {
              "type": "paragraph",
              "text": "Nothing on this list is a hidden purpose. If a future feature needs data differently, this page is where the change gets recorded first."
            }
          ]
        },
        {
          "id": "disclosures",
          "eyebrow": "04 • Transfers",
          "title": "Disclosures and Transfers",
          "toc": "4. Disclosures & Transfers",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We share data only with the services that make the shop work: **payment gateways** (to process payments), **courier partners** (to deliver), and **infrastructure providers** (Firebase, hosting)."
            },
            {
              "type": "paragraph",
              "text": "That is the entire list. No data brokers, no advertising exchanges."
            }
          ]
        },
        {
          "id": "accounts-auth",
          "eyebrow": "05 • Authentication",
          "title": "Accounts and Authentication",
          "toc": "5. Accounts & Authentication",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Sign-in runs on **Google Firebase Authentication** with two methods only: Google sign-in and email-password. There is deliberately no phone-number registration and no OTP flow — fewer identifiers collected, fewer to protect."
            },
            {
              "type": "paragraph",
              "text": "Session handling is delegated to Firebase; our own servers never see or store your password."
            }
          ]
        },
        {
          "id": "cookies",
          "eyebrow": "06 • Browser Storage",
          "title": "Cookies and Similar Technologies",
          "toc": "6. Cookies & Browser Storage",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We keep this section short because our usage is short. The storefront uses only the browser storage it needs to function:"
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Your cart and wishlist:",
                  "text": "stored locally in your own browser — they are not uploaded anywhere until you sign in and place an order."
                },
                {
                  "title": "Your sign-in session:",
                  "text": "handled by Firebase Authentication."
                }
              ]
            },
            {
              "type": "note",
              "text": "We do not run advertising trackers or third-party analytics on this site. If that ever changes, this section will describe it before it happens."
            }
          ]
        },
        {
          "id": "third-party-services",
          "eyebrow": "07 • Processors",
          "title": "Third-Party Services",
          "toc": "7. Third-Party Services",
          "blocks": [
            {
              "type": "cards",
              "cols": 3,
              "items": [
                {
                  "icon": "shield",
                  "title": "Google Firebase",
                  "text": "Authentication and data storage for business records."
                },
                {
                  "icon": "wallet",
                  "title": "Payment Gateway",
                  "text": "Processes payments when live; today the store runs in sandbox demo mode until launch approval."
                },
                {
                  "icon": "truck",
                  "title": "Courier Partners",
                  "text": "Receive the delivery details needed to bring a parcel to your door."
                }
              ]
            }
          ]
        },
        {
          "id": "non-sale",
          "eyebrow": "08 • Pledge",
          "title": "Our Strict Non-Sale of Person Data Pledge",
          "toc": "8. Non-Sale Pledge",
          "blocks": [
            {
              "type": "banner",
              "title": "We do not sell your personal data. Ever.",
              "text": "Not to advertisers, not to data brokers, not to 'partners'. The services listed above receive only what their job requires — nobody receives you."
            }
          ]
        },
        {
          "id": "data-security",
          "eyebrow": "09 • Safeguards",
          "title": "Data Security",
          "toc": "9. Data Security",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Business records are stored in **Google Cloud Firestore**. Access to order records is limited to the team that fulfils your orders and supports you."
            },
            {
              "type": "paragraph",
              "text": "We describe our practices plainly instead of making security certifications we have not earned; the draft review before launch includes exactly these claims."
            }
          ]
        },
        {
          "id": "retention",
          "eyebrow": "10 • Retention",
          "title": "Data Retention Schedules",
          "toc": "10. Retention Schedules",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We keep order records for statutory accounting periods — businesses in India must, and pretending otherwise would be false comfort."
            },
            {
              "type": "paragraph",
              "text": "Your profile and non-transactional data are different: you may request deletion of those from your account page, subject to identity verification."
            }
          ]
        },
        {
          "id": "your-choices",
          "eyebrow": "11 • Your Rights",
          "title": "Your Choices and Legal Requests",
          "toc": "11. Your Choices",
          "blocks": [
            {
              "type": "cards",
              "cols": 3,
              "items": [
                {
                  "icon": "pen",
                  "title": "Access & Correction",
                  "text": "Your profile and address book are editable from your account page at any time."
                },
                {
                  "icon": "mail",
                  "title": "Deletion Requests",
                  "text": "Request deletion of your profile and non-transactional data via the contact page, subject to identity verification."
                },
                {
                  "icon": "circleAlert",
                  "title": "Marketing Opt-Out",
                  "text": "Opt out of occasional product news anytime from your account."
                }
              ]
            }
          ]
        },
        {
          "id": "childrens-privacy",
          "eyebrow": "12 • Minors",
          "title": "Children's Privacy",
          "toc": "12. Children's Privacy",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Placing an order requires you to be at least **18 years old**. If you believe a child has provided us personal data, contact us and we will delete it."
            }
          ]
        },
        {
          "id": "policy-updates",
          "eyebrow": "13 • Change Control",
          "title": "Policy Updates",
          "toc": "13. Policy Updates",
          "blocks": [
            {
              "type": "paragraph",
              "text": "This page is currently a **draft pending business and legal review** — the chips at the top say so on purpose. When the final wording is approved, the review date at the top of this page is where changes will be recorded."
            }
          ]
        },
        {
          "id": "contact-privacy",
          "eyebrow": "14 • Direct Touchpoint",
          "title": "Contact & Privacy Requests",
          "toc": "14. Contact & Requests",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Use the message form on our contact page for any privacy request — every enquiry is recorded and reviewed. Our official support address will be published there once the business confirms it."
            },
            {
              "type": "cta",
              "label": "Contact our support team",
              "href": "/contact",
              "note": "Privacy requests are ordinary enquiries here: recorded, reviewed, and answered within one working day, Monday to Saturday."
            }
          ]
        }
      ]
    },
    "seo": {
      "description": "What Annaadhya collects, how orders and support use it, which services process it, and the choices you have over your data."
    }
  },
  {
    "slug": "terms",
    "title": "Terms & Conditions",
    "pageType": "document",
    "content": {
      "kind": "document",
      "lede": "These terms govern your use of the Annaadhya Products website and the orders you place through it.",
      "sections": [
        {
          "id": "acceptance",
          "eyebrow": "01 • Charter",
          "title": "Conclusion and Acceptance",
          "toc": "1. Conclusion & Acceptance",
          "blocks": [
            {
              "type": "paragraph",
              "text": "These terms govern your use of the Annaadhya Products website. By placing an order you confirm you are **at least 18 years old** and providing accurate information."
            },
            {
              "type": "paragraph",
              "text": "This document is a draft pending business and legal review; the review markers on this page are deliberate and will be resolved before launch."
            }
          ]
        },
        {
          "id": "website-use",
          "eyebrow": "02 • Conduct",
          "title": "Website Use & Account Responsibility",
          "toc": "2. Website Use & Accounts",
          "blocks": [
            {
              "type": "list",
              "items": [
                {
                  "title": "Accurate details:",
                  "text": "keep your profile, addresses and contact details current — they are what couriers and support rely on."
                },
                {
                  "title": "Your account:",
                  "text": "sign-in runs through Google or email; keep your own credentials safe, since actions on your account are taken as you."
                },
                {
                  "title": "Fair use:",
                  "text": "use the storefront for ordinary shopping, not for interference, scraping at scale, or abuse of support workflows."
                }
              ],
              "icon": "check"
            }
          ]
        },
        {
          "id": "artisanal-nature",
          "eyebrow": "03 • Product Truth",
          "title": "Artisanal Nature & Natural Variations",
          "toc": "3. Natural Variations",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We sell **honey, dry fruits and saffron** through our website. Product pages describe each item's pack sizes and price."
            },
            {
              "type": "cards",
              "cols": 2,
              "items": [
                {
                  "icon": "droplet",
                  "title": "Wild Forest Honey",
                  "text": "Raw and batch-varying — colour, texture and aroma change harvest to harvest; crystallisation in cold weather is natural."
                },
                {
                  "icon": "flower",
                  "title": "Kashmiri Mongra Saffron",
                  "text": "GI-tagged threads whose potency and hue vary by season; product pages state what is verified."
                }
              ]
            },
            {
              "type": "paragraph",
              "text": "Natural products vary batch to batch. Product pages state what is verified and what is pending verification — read them before ordering."
            }
          ]
        },
        {
          "id": "stock-availability",
          "eyebrow": "04 • Inventory",
          "title": "Product Information & Stock Availability",
          "toc": "4. Product Information & Stock",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Product pages show honest stock states — **in stock, low stock, or out of stock** — computed from real inventory. We do not manufacture scarcity theatre, and we do not take payment for items we cannot ship."
            }
          ]
        },
        {
          "id": "orders",
          "eyebrow": "05 • Formation",
          "title": "Orders & Acceptance",
          "toc": "5. Orders & Acceptance",
          "blocks": [
            {
              "type": "paragraph",
              "text": "An order is accepted when we confirm it after successful payment verification. Until that confirmation, nothing has been contractually accepted — this protects both of us from payment glitches."
            },
            {
              "type": "paragraph",
              "text": "In the rare case of pricing or stock errors, we will contact you and cancel with a full refund if you choose not to proceed."
            }
          ]
        },
        {
          "id": "pricing-payment",
          "eyebrow": "06 • Money",
          "title": "Pricing & Payment",
          "toc": "6. Pricing & Payment",
          "blocks": [
            {
              "type": "paragraph",
              "text": "All prices are in **Indian Rupees** and include applicable taxes where stated. We may update prices; the price shown at checkout is the price you pay."
            },
            {
              "type": "list",
              "items": [
                {
                  "title": "Payments:",
                  "text": "processed by our payment gateway partner; we do not store card details."
                },
                {
                  "title": "Sandbox honesty:",
                  "text": "payments currently run in sandbox demo mode until launch approval — the storefront says so wherever it matters."
                }
              ],
              "icon": "check"
            }
          ]
        },
        {
          "id": "shipping-dispatch",
          "eyebrow": "07 • Logistics",
          "title": "Shipping, Packaging & Dispatch",
          "toc": "7. Shipping & Dispatch",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Orders are dispatched within **2–3 working days** of payment confirmation, with delivery estimates of 3–7 working days after dispatch. The full detail — charges, complimentary tiers, tracking — lives in the Shipping & Dispatch Policy."
            },
            {
              "type": "note",
              "text": "Shipping charges and the free-shipping threshold are configured by the business and always shown at checkout before you pay."
            }
          ]
        },
        {
          "id": "cancellations-returns",
          "eyebrow": "08 • Remedies",
          "title": "Cancellations, Returns & Claims",
          "toc": "8. Cancellations & Returns",
          "blocks": [
            {
              "type": "paragraph",
              "text": "You may cancel an unpaid or not-yet-dispatched order from your account page. Returns are accepted for genuine quality issues, damaged shipments or wrong items — contacted within 48 hours of delivery with photographs."
            },
            {
              "type": "paragraph",
              "text": "Refund windows, cancellation parameters and the resolution procedure are set out in the Returns & Refunds Policy."
            }
          ]
        },
        {
          "id": "intellectual-property",
          "eyebrow": "09 • Ownership",
          "title": "Intellectual Property & Trademarks",
          "toc": "9. Intellectual Property",
          "blocks": [
            {
              "type": "paragraph",
              "text": "The Annaadhya name, our logo, and the original text, photography and layout of this website belong to the business. Borrowing them without asking is not a compliment we can accept — write to us first; reasonable requests are usually fine."
            }
          ]
        },
        {
          "id": "non-medical",
          "eyebrow": "10 • Boundaries",
          "title": "Website Content & Non-Medical Disclaimer",
          "toc": "10. Non-Medical Disclaimer",
          "blocks": [
            {
              "type": "banner",
              "title": "Nothing on this site is medical advice.",
              "text": "Product descriptions describe origin, handling and taste — they do not diagnose, treat or prevent anything. Traditional associations belong to tradition, not to a claim we make here."
            }
          ]
        },
        {
          "id": "third-party-links",
          "eyebrow": "11 • Elsewhere",
          "title": "Third-Party Services & Links",
          "toc": "11. Third-Party Services & Links",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Some links from this site lead to third parties — courier tracking pages, for example. Their content and terms are theirs; a link is not an endorsement, and their handling of your data is described in their own policies."
            }
          ]
        },
        {
          "id": "liability",
          "eyebrow": "12 • Boundaries of Duty",
          "title": "Limitation of Liability",
          "toc": "12. Limitation of Liability",
          "blocks": [
            {
              "type": "paragraph",
              "text": "To the extent permitted by law, our liability for any claim relating to an order is limited to the order value. Nothing limits liability that cannot be limited by law."
            },
            {
              "type": "paragraph",
              "text": "**Draft flag:** the final strength and wording of this clause requires legal review before launch — it is marked in the launch checklist."
            }
          ]
        },
        {
          "id": "changes",
          "eyebrow": "13 • Change Control",
          "title": "Changes to These Terms",
          "toc": "13. Changes to These Terms",
          "blocks": [
            {
              "type": "paragraph",
              "text": "We may update these terms as the business evolves; the price shown at checkout and the terms visible here at the time of your order govern that order. The review date at the top of this page records when the document last changed."
            }
          ]
        },
        {
          "id": "governing-law",
          "eyebrow": "14 • Legal Frame",
          "title": "Governing Law & Jurisdiction",
          "toc": "14. Governing Law",
          "blocks": [
            {
              "type": "paragraph",
              "text": "These terms are governed by the laws of India; courts at **Meerut, Uttar Pradesh** have exclusive jurisdiction (to be confirmed by the business)."
            },
            {
              "type": "note",
              "text": "Draft flag: jurisdiction and dispute-resolution details are the business's decision to finalise with legal counsel — this page will not guess them."
            }
          ]
        },
        {
          "id": "contact-terms",
          "eyebrow": "15 • Direct Touchpoint",
          "title": "Contact & Support",
          "toc": "15. Contact & Support",
          "blocks": [
            {
              "type": "paragraph",
              "text": "Questions about these terms, an order, or anything else on this page:"
            },
            {
              "type": "cta",
              "label": "Contact our support team",
              "href": "/contact",
              "note": "Every enquiry is recorded, and we reply within one working day, Monday to Saturday."
            }
          ]
        }
      ]
    },
    "seo": {
      "description": "The ground rules for ordering from Annaadhya — accounts, orders, prices, payments, product information, liability and governing law."
    }
  }
];

/* =============================== contact =============================== */

const CONTACT_PAGE: BuiltinPageDefault = {
  "slug": "contact",
  "title": "Contact",
  "pageType": "document",
  "content": {
    "kind": "document",
    "lede": "Questions about our honey harvests, Kashmiri saffron, or putting together a thoughtful gift? Send us a message — every enquiry is read by our team and answered by email.",
    "sections": [
      {
        "id": "write-to-us",
        "eyebrow": "We’re here to help",
        "title": "Let’s Talk. We’d Love to Hear From You.",
        "blocks": [
          {
            "type": "list",
            "items": [
              {
                "text": "We reply within one working day"
              },
              {
                "text": "Ships across India"
              }
            ]
          },
          {
            "type": "image",
            "src": "/images/hero-pantry-still-life.webp",
            "alt": "A warm still life of honey jars, saffron and dry fruits arranged on a sunlit table",
            "caption": "Thoughtfully sourced, honestly described"
          }
        ]
      },
      {
        "id": "reaching-our-team",
        "title": "Reaching our team",
        "blocks": [
          {
            "type": "cards",
            "cols": 2,
            "items": [
              {
                "title": "Email",
                "text": "For product, order and gifting questions — we reply within one working day."
              },
              {
                "title": "Order support",
                "text": "Dispatch status and courier tracking live on each order in your account — having your order number handy helps us help you faster."
              },
              {
                "title": "Products & sourcing",
                "text": "Curious about our honey harvests, saffron lots or dry-fruit origins? Every product page states what is verified for the batch on sale."
              },
              {
                "title": "Gifting & bulk",
                "text": "Festive hampers, employee welcomes and client gifts. Write with the occasion, the budget per gift and the quantity — we respond with what we can genuinely offer."
              }
            ]
          },
          {
            "type": "note",
            "title": "Reply time",
            "text": "We reply within one working day, Monday to Saturday."
          },
          {
            "type": "note",
            "title": "Sourcing you can verify",
            "text": "We publish only what we can verify with supplier documents for the batch being sold — when a batch has test documentation, the product page states exactly what was tested and by whom."
          },
          {
            "type": "cta",
            "label": "Read our story",
            "href": "/about"
          },
          {
            "type": "note",
            "title": "Privacy & discretion",
            "text": "Your message and contact details are used only to respond to your enquiry and are never sold or shared. See our privacy policy."
          }
        ]
      }
    ]
  },
  "seo": {
    "description": "Questions about orders, products, sourcing or gifting? Message the Annaadhya team — every enquiry is read and answered by email."
  }
};

/* ============================== assembly =============================== */

/** Defaults for built-in storefront pages, in storefront navigation order. */
export const BUILTIN_PAGES: BuiltinPageDefault[] = [
  OUR_STORY_PAGE,
  FAQ_PAGE,
  ...POLICY_PAGES,
  CONTACT_PAGE,
];
