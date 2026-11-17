/** Approved concept taxonomy (PRD section 6, step C). Keys are stable identifiers. */
export const CONCEPTS = {
  scarcity: "Scarcity",
  choice: "Choice",
  opportunity_cost: "Opportunity cost",
  incentives: "Incentives",
  supply_demand: "Supply and demand",
  elasticity: "Elasticity",
  externalities: "Externalities",
  public_goods: "Public goods",
  market_failure: "Market failure",
  government_intervention: "Government intervention",
  tax_incidence: "Tax incidence",
  inequality: "Inequality",
  economic_growth: "Economic growth",
  inflation: "Inflation",
  unemployment: "Unemployment",
  trade: "Trade",
  comparative_advantage: "Comparative advantage",
  consumer_producer_surplus: "Consumer and producer surplus",
  exchange_rates: "Exchange rates",
  development: "Development",
  institutions: "Institutions",
  behavioural_economics: "Behavioural economics",
  market_power: "Market power",
  game_theory: "Game theory",
  relative_prices: "Relative price change",
} as const;

export type ConceptKey = keyof typeof CONCEPTS;
export const CONCEPT_KEYS = Object.keys(CONCEPTS) as [ConceptKey, ...ConceptKey[]];
