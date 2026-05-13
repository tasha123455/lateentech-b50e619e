export type Product = { id: string; name: string; code: string; price: number; emoji: string; sales: number };

export const businessMock = {
  greetingName: "Sarah",
  balance: 12480.5,
  pendingPayout: 2340,
  stats: [
    { label: "Sales today", value: "£842", sub: "+12%", up: true },
    { label: "Orders", value: "37", sub: "+5%", up: true },
    { label: "Conversion", value: "4.2%", sub: "-0.3%", up: false },
  ],
  products: [
    { id: "p1", name: "Sunrise Runner", code: "SR-001", price: 89, emoji: "👟", sales: 124 },
    { id: "p2", name: "Coastal Tee", code: "CT-014", price: 32, emoji: "👕", sales: 88 },
    { id: "p3", name: "Trail Cap", code: "TC-007", price: 24, emoji: "🧢", sales: 41 },
  ] as Product[],
  notifications: [
    { id: "n1", kind: "ok" as const, title: "Payout sent", body: "£1,240.00 transferred to your bank.", time: "2h" },
    { id: "n2", kind: "info" as const, title: "New marketer joined", body: "Alex M. is promoting Sunrise Runner.", time: "5h" },
    { id: "n3", kind: "warn" as const, title: "Low stock", body: "Coastal Tee has 4 units left.", time: "1d" },
  ],
};

export const marketerMock = {
  greetingName: "Alex",
  earnings: 2487.2,
  pendingPayout: 482,
  stats: [
    { label: "Earned this week", value: "£312", sub: "+18%", up: true },
    { label: "Clicks", value: "1.2k", sub: "+9%", up: true },
    { label: "Conversion", value: "3.1%", sub: "+0.4%", up: true },
  ],
  campaigns: [
    { id: "c1", name: "Sunrise Runner", code: "SR-001", price: 89, emoji: "👟", sales: 38 },
    { id: "c2", name: "Coastal Tee", code: "CT-014", price: 32, emoji: "👕", sales: 24 },
    { id: "c3", name: "Trail Cap", code: "TC-007", price: 24, emoji: "🧢", sales: 12 },
  ] as Product[],
  notifications: [
    { id: "n1", kind: "ok" as const, title: "Sale credited", body: "+£8.90 commission on SR-001.", time: "10m" },
    { id: "n2", kind: "info" as const, title: "New product available", body: "Trail Cap is now open to promote.", time: "3h" },
  ],
};
