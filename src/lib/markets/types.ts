/**
 * What a country has to answer before the app can run in it.
 *
 * This type is the checklist. Every field is required, so a new market cannot
 * compile until somebody has decided what it says — there is no way to add a
 * country and quietly inherit Libya's platform fee, Libya's phone format or
 * Libya's banks, which is exactly the mistake this file exists to prevent.
 *
 * Nothing here is a default. If a value would be "the same as Libya", it still
 * has to be written down, because the next person reading it needs to know
 * that was a decision rather than an oversight.
 */

/** A city, town or district orders can be delivered to. */
export type MarketCity = { en: string; ar: string };

/**
 * One way a marketer can be paid out.
 *
 * `value` is what gets stored on the profile and must never change once
 * accounts carry it — the labels are display only, and the two can disagree:
 * Libya stores "Bank of Unity" but the bank's own English name is Wahda Bank.
 */
export type PayoutMethod = {
  /** Stored on the profile. Changing this orphans every account using it. */
  value: string;
  labelEn: string;
  labelAr: string;
  /** A phone-credit method validates the number against these prefixes. */
  phonePrefixes?: string[];
  phoneHintEn?: string;
  phoneHintAr?: string;
  /** The method is tied to one institution, so the bank picker is locked. */
  fixedBank?: boolean;
};

export type MarketSpec = {
  /** ISO 3166-1 alpha-2, and the primary key of the `markets` table. */
  code: string;
  nameEn: string;
  nameAr: string;
  flag: string;

  money: {
    /** ISO 4217. Wallets, fees and payouts in this market are all in it. */
    currencyCode: string;
    /** How the currency is written where it is spent — "د.ل" rather than
     *  "LYD". Screens with no amount to take a symbol from ask for this
     *  rather than guessing. */
    currencySymbol: string;
    /**
     * What the platform keeps per unit sold.
     *
     * Read as: above `threshold`, take `pct` of the unit price; at or below
     * it, take `fixed`. All three are in `currencyCode`, which is why they
     * cannot be shared across markets — 5 and 100 mean nothing in dollars.
     *
     * Must match the `fee_*` columns on this market's row, because
     * `products.platform_fee` is computed here and then stored.
     */
    fee: { pct: number; fixed: number; threshold: number };
    /** Smallest balance that can be withdrawn. Mirrors `min_withdraw`. */
    minWithdraw: number;
    /** Wait between withdrawals. Mirrors `payout_cycle_days`. */
    payoutCycleDays: number;
    /** Days after delivery in which an order can still be refunded — and so
     *  also the delay before its commission becomes withdrawable. The two are
     *  the same number on purpose: while a refund can still reach the money it
     *  must not be spendable, and once it is spendable no refund may reach it.
     *  Mirrors `refund_window_days`. */
    refundWindowDays: number;
  };

  contact: {
    /** International dialling prefix, written with its plus. */
    dialCode: string;
    /** The national number, without the dial code. */
    localPhone: RegExp;
    phoneHintEn: string;
    phoneHintAr: string;
    /** Support line for this market, digits only, for a wa.me link. */
    supportWhatsapp: string;
    supportWhatsappDisplay: string;
  };

  payout: {
    /**
     * Banks and wallets offered in the payout form. The entry itself is the
     * stored value, so this list is append-mostly: removing one strands the
     * profiles that chose it.
     */
    banks: string[];
    /** Stored bank → the name it trades under in English. */
    bankNamesEn: Record<string, string>;
    methods: PayoutMethod[];
    /** Where marketers send the platform's cut, shown in the instructions. */
    depositAccountName: string;
    depositAccountNumber: string;
  };

  places: {
    /** Ordered biggest first — the picker shows them in this order. */
    cities: MarketCity[];
  };

  formats: {
    /**
     * Date locales. Day/month order is not cosmetic: 03/04 is the 3rd of
     * April in en-GB and the 4th of March in en-US, on the same screen.
     */
    dateLocaleEn: string;
    dateLocaleAr: string;
    /** IANA zone. Decides what "today" means for orders and payout cycles. */
    timeZone: string;
  };
};
