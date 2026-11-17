import type { Lens } from "@/schemas/events";

export type Scenario = "carbon_tax" | "supermarket_price" | "tariff" | "generic";

export function detectScenario(text: string): Scenario {
  const t = text.toLowerCase();
  if (/(carbon|emission|fuel tax|petrol tax|gasoline tax|pollution tax)/.test(t)) return "carbon_tax";
  if (/(tariff|import dut|trade war|import tax|customs dut)/.test(t)) return "tariff";
  if (/(supermarket|grocer|food price|price rise|price increase|prices? (rose|went up|jumped))/.test(t)) return "supermarket_price";
  return "generic";
}

export const SCENARIO_UNKNOWNS: Record<Scenario, string[]> = {
  carbon_tax: [
    "The size of the tax and how revenue is used",
    "How responsive fuel demand is in the short and long run",
    "Whether alternatives (public transport, electric vehicles) are available to households",
  ],
  supermarket_price: [
    "Whether other prices (rent, wages, other goods) moved in the same period",
    "Whether the rise reflects costs, demand, or the retailer's pricing power",
    "How large the rise is compared with the economy-wide price level",
  ],
  tariff: [
    "Which goods are covered and the size of the tariff",
    "Whether exporters, importers or consumers bear most of the cost",
    "Whether other countries retaliate",
  ],
  generic: ["Which decisions, prices or quantities changed, by how much, and over what period"],
};

export const SCENARIO_STAKEHOLDERS: Record<Scenario, Array<{ name: string; position: string }>> = {
  carbon_tax: [
    { name: "Households (template)", position: "Face higher fuel costs; effects differ by income and access to alternatives" },
    { name: "Firms (template)", position: "May pass costs on or change production methods" },
    { name: "Government (template)", position: "Seeks to reduce emissions and may raise revenue" },
    { name: "Communities affected by pollution and climate damage (template)", position: "Bear costs of emissions that the fuel price does not currently reflect" },
    { name: "Fuel-producing workers and regions (template)", position: "May lose income if fuel demand falls" },
  ],
  supermarket_price: [
    { name: "Shoppers (template)", position: "May switch products or reduce quantity bought" },
    { name: "Retailer (template)", position: "Balances costs, competition and margins" },
    { name: "Suppliers (template)", position: "Their costs and bargaining power affect shelf prices" },
  ],
  tariff: [
    { name: "Domestic producers (template)", position: "May gain from less import competition" },
    { name: "Consumers and importing firms (template)", position: "May face higher prices" },
    { name: "Foreign exporters (template)", position: "May lose sales or cut prices" },
    { name: "Government (template)", position: "Collects tariff revenue; may pursue strategic goals" },
  ],
  generic: [{ name: "People affected (template)", position: "Positions must be identified from your sources" }],
};

export const SCENARIO_OPPORTUNITIES: Record<Scenario, string[]> = {
  carbon_tax: ["Compare private and social cost", "Shift a supply curve with a per-unit tax and locate the burden", "Discuss equity and policy alternatives"],
  supermarket_price: ["Separate one price from the general price level", "Use supply and demand to test explanations", "Evaluate what data would show inflation"],
  tariff: ["Show surplus changes from a tariff", "Link to comparative advantage", "Compare winners and losers with balanced perspectives"],
  generic: ["Identify the scarce resource and the trade-off", "Describe incentives facing each group"],
};

type RawLens = Omit<Lens, "misconceptionCorrections">;
const L = (l: RawLens): RawLens => l;

const RAW_LENSES: Record<Scenario, RawLens[]> = {
  carbon_tax: [
    L({
      conceptKey: "externalities", relevance: 0.95,
      mechanism: "Burning fuel imposes costs (pollution, climate damage) on people who are not part of the transaction, so the private cost of fuel is lower than the social cost. A tax set equal to the marginal external damage (a Pigouvian tax) aims to make buyers face that cost.",
      evidenceClaimIndexes: [], prerequisites: ["Marginal cost and benefit", "Supply and demand diagram"],
      misconceptions: ["Pollution is only a moral issue, not an economic one", "Externalities mean markets never work"],
      inquiryQuestion: "Who pays the full cost of burning fuel, and how could a price signal change that?",
      alternativeLens: "Property rights and bargaining (Coase) when affected parties are few and can negotiate.",
      limitations: ["The size of the external cost is uncertain and contested"],
    }),
    L({
      conceptKey: "tax_incidence", relevance: 0.88,
      mechanism: "Who bears a per-unit tax depends on elasticity (how strongly buyers or sellers respond to a price change), not on who legally pays it: the side less able to change its behaviour bears more of the burden.",
      evidenceClaimIndexes: [], prerequisites: ["Elasticity", "Shifting the supply curve"],
      misconceptions: ["The seller who sends the tax to the government bears all of it"],
      inquiryQuestion: "Who really ends up paying a fuel tax: drivers, fuel suppliers, or both?",
      alternativeLens: "Distributional analysis by income group.",
      limitations: ["Incidence also depends on market structure and time horizon"],
    }),
    L({
      conceptKey: "government_intervention", relevance: 0.85,
      mechanism: "Taxes, subsidies and regulation are alternative tools; each has different efficiency, cost and fairness effects.",
      evidenceClaimIndexes: [], prerequisites: ["Market failure"],
      misconceptions: ["Government action is always better, or always worse, than markets"],
      inquiryQuestion: "Would a tax, a subsidy or a regulation best reduce emissions, and at what cost?",
      alternativeLens: "Political economy: who gains from each design.",
      limitations: ["Real outcomes depend on design and enforcement"],
    }),
    L({
      conceptKey: "elasticity", relevance: 0.8,
      mechanism: "If demand for fuel is inelastic in the short run, a tax raises revenue but cuts consumption little; over time, demand tends to be more elastic.",
      evidenceClaimIndexes: [], prerequisites: ["Percentage change", "Demand curve"],
      misconceptions: ["Elasticity is the same as the slope of the demand curve"],
      inquiryQuestion: "How much would people cut fuel use if the price rose by 10%?",
      alternativeLens: "Behavioural responses beyond price (habits, infrastructure).",
      limitations: ["Elasticity estimates vary by place and period"],
    }),
    L({
      conceptKey: "incentives", relevance: 0.7,
      mechanism: "A higher price of fuel changes the relative cost of alternatives, encouraging substitution and innovation.",
      evidenceClaimIndexes: [], prerequisites: ["Opportunity cost"],
      misconceptions: ["Incentives only work through money"],
      inquiryQuestion: "Which choices become more attractive when fuel costs more?",
      alternativeLens: "Behavioural economics: framing and defaults.",
      limitations: ["Some households have few alternatives"],
    }),
    L({
      conceptKey: "inequality", relevance: 0.55,
      mechanism: "A fuel tax can take a larger share of income from lower-income households unless revenue is returned or targeted.",
      evidenceClaimIndexes: [], prerequisites: ["Share of income"],
      misconceptions: ["Efficiency and fairness always point the same way"],
      inquiryQuestion: "How could revenue be used to protect low-income households?",
      alternativeLens: "Regional differences (rural vs urban).",
      limitations: ["Evidence depends on the country and how revenue is used"],
    }),
  ],
  supermarket_price: [
    L({
      conceptKey: "relative_prices", relevance: 0.95,
      mechanism: "A change in one good's price relative to others is a relative price change. It can reflect that good's own supply or demand conditions without any change in the general price level.",
      evidenceClaimIndexes: [], prerequisites: ["Price vs price level"],
      misconceptions: ["One item getting more expensive proves there is inflation"],
      inquiryQuestion: "Is this a change in one price, or in prices in general?",
      alternativeLens: "Menu costs and retailer pricing strategy.",
      limitations: ["A single observation cannot separate cost and demand explanations"],
    }),
    L({
      conceptKey: "supply_demand", relevance: 0.9,
      mechanism: "A fall in supply (higher input costs, poor harvest) or a rise in demand raises the equilibrium price; the evidence needed differs for each explanation.",
      evidenceClaimIndexes: [], prerequisites: ["Shifts vs movements along curves"],
      misconceptions: ["Prices rise only because sellers are greedy", "A rise in price proves that demand has increased"],
      inquiryQuestion: "What evidence would tell us whether supply fell or demand rose?",
      alternativeLens: "Market power in retail pricing.",
      limitations: ["Needs quantity data as well as price data"],
    }),
    L({
      conceptKey: "inflation", relevance: 0.8,
      mechanism: "Inflation is a sustained rise in the general price level, measured by an index of many goods. A price rise at one supermarket, or in one product, is not by itself inflation.",
      evidenceClaimIndexes: [], prerequisites: ["Price index basket"],
      misconceptions: ["Any price increase is inflation", "Inflation means every price rises equally"],
      inquiryQuestion: "What data would show whether the whole price level is rising?",
      alternativeLens: "Relative price change (above) as the more appropriate frame for one product.",
      limitations: ["Caution: do not describe this event as economy-wide inflation without index data"],
    }),
    L({
      conceptKey: "elasticity", relevance: 0.6,
      mechanism: "How much shoppers cut back depends on substitutes and necessity, which determines revenue and shopper response.",
      evidenceClaimIndexes: [], prerequisites: ["Percentage change"],
      misconceptions: ["All groceries are equally price-sensitive"],
      inquiryQuestion: "Which products would shoppers cut first if prices rose, and why?",
      alternativeLens: "Income effects on low-income households.",
      limitations: ["Needs sales data"],
    }),
    L({
      conceptKey: "market_power", relevance: 0.45,
      mechanism: "Market power affects how a firm responds to cost changes and how large its margin is; how much of a cost rise is passed on depends on the shape of demand and on competition.",
      evidenceClaimIndexes: [], prerequisites: ["Competition"],
      misconceptions: ["Large retailers can set any price they like"],
      inquiryQuestion: "How much competition does this retailer face?",
      alternativeLens: "Supplier bargaining power.",
      limitations: ["Claims of market power need evidence on margins and entry"],
    }),
  ],
  tariff: [
    L({
      conceptKey: "consumer_producer_surplus", relevance: 0.9,
      mechanism: "A tariff raises the domestic price: consumer surplus falls, domestic producer surplus and government revenue rise, and a deadweight loss results.",
      evidenceClaimIndexes: [], prerequisites: ["Supply and demand", "Area on a graph"],
      misconceptions: ["Tariffs only hurt foreigners"],
      inquiryQuestion: "Who gains and who loses when an import tariff is introduced?",
      alternativeLens: "Strategic trade and infant industry arguments.",
      limitations: ["Model assumes a small open economy; large countries can shift terms of trade"],
    }),
    L({
      conceptKey: "comparative_advantage", relevance: 0.88,
      mechanism: "Countries gain from specialising where their opportunity cost is lower; restricting trade reduces these gains.",
      evidenceClaimIndexes: [], prerequisites: ["Opportunity cost"],
      misconceptions: ["Trade is only beneficial if a country is best at everything"],
      inquiryQuestion: "What is each country's opportunity cost of producing the good?",
      alternativeLens: "Adjustment costs for workers who lose jobs.",
      limitations: ["Gains are broad but losses can be concentrated"],
    }),
    L({
      conceptKey: "trade", relevance: 0.82,
      mechanism: "Tariffs change relative prices of traded goods and can prompt retaliation and shifts in trade patterns.",
      evidenceClaimIndexes: [], prerequisites: ["Imports and exports"],
      misconceptions: ["A trade deficit is automatically bad"],
      inquiryQuestion: "How might trading partners respond?",
      alternativeLens: "Game theory of retaliation.",
      limitations: ["Outcomes are uncertain and contested"],
    }),
    L({
      conceptKey: "tax_incidence", relevance: 0.7,
      mechanism: "A tariff is a tax; its burden is split between domestic buyers and foreign exporters depending on elasticities.",
      evidenceClaimIndexes: [], prerequisites: ["Elasticity"],
      misconceptions: ["The exporting country always pays"],
      inquiryQuestion: "Did import prices rise for domestic buyers, or did exporters cut their prices?",
      alternativeLens: "Pass-through through supply chains.",
      limitations: ["Needs price data from before and after"],
    }),
    L({
      conceptKey: "inequality", relevance: 0.6,
      mechanism: "Gains and losses differ across industries, regions and income groups.",
      evidenceClaimIndexes: [], prerequisites: ["Distribution vs efficiency"],
      misconceptions: ["If total gains exceed losses, nobody is harmed"],
      inquiryQuestion: "Which groups bear the costs, and can they be compensated?",
      alternativeLens: "Regional economics.",
      limitations: ["Compensation rarely happens automatically"],
    }),
  ],
  generic: [
    L({
      conceptKey: "scarcity", relevance: 0.8,
      mechanism: "Resources are limited relative to wants, so someone must decide how to use them.",
      evidenceClaimIndexes: [], prerequisites: [],
      misconceptions: ["Scarcity only applies to poor people or rare goods"],
      inquiryQuestion: "What is scarce in this situation and who decides how to use it?",
      alternativeLens: "Institutions that allocate resources.",
      limitations: ["Needs details about the specific resource"],
    }),
    L({
      conceptKey: "opportunity_cost", relevance: 0.78,
      mechanism: "Every choice means giving up the next best alternative.",
      evidenceClaimIndexes: [], prerequisites: ["Scarcity"],
      misconceptions: ["Opportunity cost is the same as money cost"],
      inquiryQuestion: "What is given up by the main choice described?",
      alternativeLens: "Sunk costs and marginal thinking.",
      limitations: ["Alternatives must be identified from your sources"],
    }),
    L({
      conceptKey: "incentives", relevance: 0.7,
      mechanism: "People respond to changes in costs and benefits.",
      evidenceClaimIndexes: [], prerequisites: [],
      misconceptions: ["Incentives are only financial"],
      inquiryQuestion: "How do the costs and benefits facing each group change?",
      alternativeLens: "Behavioural economics.",
      limitations: ["Responses vary by group"],
    }),
    L({
      conceptKey: "supply_demand", relevance: 0.6,
      mechanism: "If a market is involved, prices and quantities adjust to changes in supply and demand.",
      evidenceClaimIndexes: [], prerequisites: ["Demand and supply curves"],
      misconceptions: ["Price alone explains everything"],
      inquiryQuestion: "Which of supply or demand changed, and what is the evidence?",
      alternativeLens: "Non-market allocation.",
      limitations: ["Only applies if a market is part of the situation"],
    }),
  ],
};

const CORRECTIONS: Record<string, string[]> = {
  "carbon_tax:externalities": [
    "Not quite. Pollution is also an economic issue: it imposes costs on people outside the transaction, so private cost differs from social cost.",
    "Not quite. Markets work well in many ways; an externality is a specific gap between private and social cost, and the question is how to close that gap.",
  ],
  "carbon_tax:tax_incidence": ["Not quite. Who legally pays a tax does not decide who bears it: the burden falls more on the side, buyers or sellers, that is less able to change its behaviour."],
  "carbon_tax:government_intervention": ["Not quite. Taxes, subsidies and regulation differ in cost, effectiveness and fairness, so the best choice depends on design and evidence."],
  "carbon_tax:elasticity": ["Not quite. Elasticity compares percentage changes in quantity and price, so it is not the same as slope, which depends on the units used."],
  "carbon_tax:incentives": ["Not quite. Incentives include any change in costs or benefits, such as time, convenience or effort, as well as money."],
  "carbon_tax:inequality": ["Not quite. A policy can raise efficiency while spreading its costs unequally, so distribution has to be assessed separately."],
  "supermarket_price:relative_prices": ["Not quite. A rise in one price is a relative price change; inflation needs a sustained rise in the general price level measured across many goods."],
  "supermarket_price:supply_demand": [
    "Not quite. Prices can rise because costs rose, supply fell or demand rose, and evidence is needed to tell which.",
    "Not quite. A higher price could come from higher demand or from lower supply, so price alone cannot show which.",
  ],
  "supermarket_price:inflation": [
    "Not quite. Inflation is a sustained rise in the general price level, not any single price increase.",
    "Not quite. In inflation the average level of prices rises, but individual prices can rise by different amounts and some can fall.",
  ],
  "supermarket_price:elasticity": ["Not quite. Price sensitivity depends on substitutes, necessity and budget share, so it differs across goods."],
  "supermarket_price:market_power": ["Not quite. Even firms with market power face demand: raising prices too far loses sales, and competition and entry limit what they can charge."],
  "tariff:consumer_producer_surplus": ["Not quite. A tariff raises domestic prices, so domestic consumers lose surplus while domestic producers and the government gain."],
  "tariff:comparative_advantage": ["Not quite. Gains come from specialising where opportunity cost is lower, even for a country that is not the best at producing anything."],
  "tariff:trade": ["Not quite. A trade deficit is a gap between imports and exports; whether it is a problem depends on why it arises and how it is financed."],
  "tariff:tax_incidence": ["Not quite. A tariff's burden is shared between domestic buyers and foreign exporters depending on how responsive each side is."],
  "tariff:inequality": ["Not quite. Even if total gains exceed total losses, particular groups can lose, so distribution and compensation matter."],
  "generic:scarcity": ["Not quite. Scarcity means resources are limited relative to wants, which is true for everyone."],
  "generic:opportunity_cost": ["Not quite. Opportunity cost is the value of the next best alternative given up, which may not involve money."],
  "generic:incentives": ["Not quite. Incentives include any change in costs or benefits, financial or not."],
  "generic:supply_demand": ["Not quite. Price changes can come from supply or demand shifts, and quantities and other evidence are needed to tell which."],
};

export const SCENARIO_LENSES: Record<Scenario, Lens[]> = Object.fromEntries(
  (Object.keys(RAW_LENSES) as Scenario[]).map((sc) => [
    sc,
    RAW_LENSES[sc].map((l) => ({ ...l, misconceptionCorrections: CORRECTIONS[`${sc}:${l.conceptKey}`] ?? [] })),
  ]),
) as Record<Scenario, Lens[]>;
