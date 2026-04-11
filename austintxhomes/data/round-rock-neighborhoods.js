// Round Rock, TX — neighborhood data for the topical web at /round-rock/*
// Each entry powers the 4 page types: hub, homes-for-sale, homes-for-rent, best-realtor.

module.exports = {
  'teravista': {
    slug: 'teravista',
    name: 'Teravista',
    zips: ['78665'],
    subdivisionName: 'Teravista',
    priceRange: '$380K – $750K',
    medianPrice: '$525K',
    rentRange: '$2,100 – $3,500/mo',
    homeTypes: 'Single-family on golf course, greenbelt lots, 3–5 bedrooms',
    schools: 'Round Rock ISD — Teravista Elementary (on-site), Hopewell Middle, Stony Point High',
    commute: '20 min to Domain, 28 min to downtown Austin, 10 min to Dell HQ',
    vibe: 'Golf course community, master-planned, family-oriented, well-kept amenities',
    tags: ['Golf Course', 'Master-Planned', 'Round Rock ISD', 'Family-Friendly', 'Amenities'],
    intro: [
      'Teravista is one of Round Rock\'s flagship master-planned communities — a 1,700-home golf course neighborhood straddling the Round Rock / Georgetown line. Built on a 300-acre Championship golf course by Whitney Golf, the community wraps its homes around fairways, greenbelts, and mature oak trees.',
      'What sets Teravista apart is the combination of on-site amenities and school location. Teravista Elementary is inside the neighborhood — kids walk or bike to school. The community owns three amenity centers with resort-style pools, fitness facilities, a clubhouse, tennis courts, and miles of trails connecting to Brushy Creek.',
      'Homes typically list between $380K and $750K with the newer sections (Teravista North) skewing higher. Most buyers here are families with school-age kids, Dell/Apple employees looking for a short commute, and move-up buyers from central Austin who want more square footage and better schools without going too far out.'
    ],
    highlights: [
      { icon: '⛳', label: 'Teravista Golf Course', text: '18-hole championship course open to the public — residents get discounted rates' },
      { icon: '🏫', label: 'Teravista Elementary On-Site', text: 'Walk-to-school elementary inside the neighborhood (RRISD)' },
      { icon: '🏊', label: 'Three Amenity Centers', text: 'Resort pools, splash pads, fitness centers, tennis courts, clubhouse' },
      { icon: '🌳', label: '15 Miles of Trails', text: 'Connected trail system along Brushy Creek greenbelt' }
    ],
    faqs: [
      { q: 'What school district is Teravista in?', a: 'Round Rock ISD. Teravista Elementary is located inside the community. Middle school is Hopewell Middle, high school is Stony Point High. Some sections may feed different schools — always verify with the current ISD boundary map before buying.' },
      { q: 'How much is the HOA in Teravista?', a: 'HOA dues run roughly $90–$130/month depending on the section, covering amenity center access, common area maintenance, and trail upkeep. The Community Association office is at the main amenity center off Teravista Club Drive.' },
      { q: 'Do I need to play golf to live in Teravista?', a: 'No. The golf course is public and operated separately from the HOA — residents get discounted rates but are not required to be members. Most homes near the course have golf course or greenbelt views regardless.' },
      { q: 'What\'s the typical commute from Teravista?', a: 'About 20 minutes to The Domain / Apple campus via I-35 or the 130 toll, 28 minutes to downtown Austin, 10 minutes to Dell HQ in Round Rock. Traffic on I-35 is the main variable — the toll road is much more reliable.' }
    ],
    buyReasons: [
      { icon: '🏡', heading: 'Real Amenities', body: 'Three full amenity centers with pools, fitness, tennis, and clubhouse — most master-planned communities have one. Teravista has three.' },
      { icon: '📚', heading: 'Walk-to-School', body: 'Teravista Elementary is inside the neighborhood. Rare in Round Rock — most kids bus to school.' },
      { icon: '💰', heading: 'Better Value Than Austin', body: 'A 4BR / 2,800 sqft home in Teravista lists for $500–$600K. The same home in Mueller or Hyde Park would be $900K+.' }
    ],
    nearby: ['forest-creek', 'paloma-lake', 'mayfield-ranch']
  },

  'forest-creek': {
    slug: 'forest-creek',
    name: 'Forest Creek',
    zips: ['78664'],
    subdivisionName: 'Forest Creek',
    priceRange: '$350K – $650K',
    medianPrice: '$475K',
    rentRange: '$2,000 – $3,200/mo',
    homeTypes: 'Established single-family, many with mature trees, 3–4 bedrooms',
    schools: 'Round Rock ISD — Forest Creek Elementary, Ridgeview Middle, Cedar Ridge High',
    commute: '18 min to Domain, 25 min to downtown Austin, 8 min to Dell HQ',
    vibe: 'Established community, mature trees, golf course, great schools, long-term residents',
    tags: ['Golf Course', 'Established', 'Mature Trees', 'Round Rock ISD', 'Value'],
    intro: [
      'Forest Creek is Round Rock\'s oldest golf course community — built out over the 1990s and early 2000s around the Forest Creek Golf Club. What you get here that newer neighborhoods can\'t replicate: 25-year-old oaks, established landscaping, settled HOA dues, and a mix of original owners and second-generation buyers.',
      'The neighborhood sits just east of I-35 off Gattis School Road, making it one of the shortest commutes to Dell HQ and The Domain. Cedar Ridge High School — one of Round Rock ISD\'s higher-rated high schools — is a short drive away.',
      'Forest Creek homes list between $350K and $650K depending on the section and level of updates. The oldest sections near the golf course clubhouse have bigger lots but need updating. The newer sections toward the back of the neighborhood have tighter lots but more modern finishes.'
    ],
    highlights: [
      { icon: '⛳', label: 'Forest Creek Golf Club', text: '18-hole course and driving range — public access, resident discounts' },
      { icon: '🌳', label: 'Mature Tree Canopy', text: '25+ year trees — rare in Round Rock, most suburbs have younger landscapes' },
      { icon: '🚗', label: 'I-35 Access', text: 'Direct access to I-35 at Gattis School — fastest route to Dell HQ' },
      { icon: '💰', label: 'Settled HOA', text: 'Established HOA dues and reserves — no surprise assessments from new infrastructure' }
    ],
    faqs: [
      { q: 'How old is Forest Creek?', a: 'The first homes were built in the early 1990s around the golf course. The neighborhood was fully built out by the mid-2000s. Most homes are 20–30 years old with some as new as 15 years.' },
      { q: 'Is Forest Creek in Round Rock ISD?', a: 'Yes. Forest Creek Elementary is the neighborhood school, feeding into Ridgeview Middle and Cedar Ridge High. Cedar Ridge is one of Round Rock ISD\'s top-performing high schools.' },
      { q: 'Does Forest Creek have HOA fees?', a: 'Yes. HOA dues run about $50–$75/month — significantly lower than newer master-planned communities because the infrastructure is paid off. The HOA maintains common areas and the pool/clubhouse.' },
      { q: 'How does Forest Creek compare to Teravista?', a: 'Forest Creek is older (established late 90s vs early 2010s) and more affordable. Teravista has more amenity centers and is bigger. Forest Creek has older trees and shorter commutes. Both are in Round Rock ISD but feed different schools.' }
    ],
    buyReasons: [
      { icon: '🌳', heading: 'Mature Landscaping', body: '25+ year-old oaks and established yards. Newer Round Rock neighborhoods have baby trees for 15 more years.' },
      { icon: '💰', heading: 'Lower HOA', body: '$50–75/month vs $120+ in newer communities. Adds up to thousands in savings over the life of the loan.' },
      { icon: '🚗', heading: 'Dell Campus Adjacent', body: 'Direct Gattis School Rd → I-35 route to Dell HQ in under 10 minutes — beats newer outer-ring neighborhoods.' }
    ],
    nearby: ['teravista', 'brushy-creek', 'behrens-ranch']
  },

  'paloma-lake': {
    slug: 'paloma-lake',
    name: 'Paloma Lake',
    zips: ['78665'],
    subdivisionName: 'Paloma Lake',
    priceRange: '$400K – $725K',
    medianPrice: '$525K',
    rentRange: '$2,200 – $3,400/mo',
    homeTypes: 'Newer construction, 3–5 bedrooms, larger square footage, some waterfront',
    schools: 'Round Rock ISD — Herrington Elementary, Hopewell Middle, Stony Point High',
    commute: '22 min to Domain, 30 min to downtown Austin, 15 min to Dell HQ',
    vibe: 'Master-planned, newer construction, lake community, family-focused amenities',
    tags: ['Master-Planned', 'Lake Community', 'New Construction', 'Round Rock ISD', 'Amenities'],
    intro: [
      'Paloma Lake is a master-planned community built around a 22-acre private lake in northeast Round Rock. The neighborhood features a resident-only amenity center with two pools, a splash pad, playground, and fitness area — plus direct lake access with fishing docks and walking trails.',
      'Homes in Paloma Lake are newer construction (most built between 2015 and 2024) by builders like Pulte, David Weekley, and Highland. Floor plans typically range from 2,500–4,000 sqft with modern finishes, smart home wiring, and energy-efficient construction — appealing to buyers who want move-in-ready without the small-lot tradeoffs of Cedar Park or Leander.',
      'Paloma Lake is a particularly strong fit for families relocating from out of state (many from California and the Pacific Northwest) who want the Austin metro lifestyle without Austin proper pricing. Expect to pay $400–725K depending on lot position, lake views, and square footage.'
    ],
    highlights: [
      { icon: '🏞️', label: '22-Acre Private Lake', text: 'Fishing docks, walking trails, and lake views — rare in a suburban community' },
      { icon: '🏊', label: 'Resort-Style Amenities', text: 'Two pools, splash pad, playground, fitness center — all resident-only' },
      { icon: '🏠', label: 'Newer Construction', text: 'Most homes built 2015–2024 — energy efficient, smart wiring, modern finishes' },
      { icon: '🏫', label: 'Strong Schools', text: 'Herrington Elementary has a strong TEA rating; feeds into Hopewell and Stony Point' }
    ],
    faqs: [
      { q: 'Can residents swim in Paloma Lake?', a: 'No — the lake is for fishing, kayaking, and walking trails only. Swimming happens at the community pools. The lake is stocked with bass, bluegill, and catfish.' },
      { q: 'What\'s the HOA in Paloma Lake?', a: 'HOA dues are approximately $110–$140/month, which covers amenity center access, lake maintenance, common areas, and trail upkeep. Newer sections may have higher dues.' },
      { q: 'Who builds in Paloma Lake?', a: 'The major builders are Pulte Homes, David Weekley, Highland Homes, and Scott Felder. Most remaining inventory comes from these builders, with some resale from original owners.' },
      { q: 'How new is Paloma Lake?', a: 'Construction started around 2012 and continued through 2024. Most homes are 5–12 years old. Some newer sections are still being built out.' }
    ],
    buyReasons: [
      { icon: '🏞️', heading: 'Lake Lifestyle', body: 'Most master-planned communities just have pools. Paloma Lake has an actual 22-acre lake with fishing and trails.' },
      { icon: '🏠', heading: 'Modern Construction', body: 'Energy-efficient, smart-wired homes built 2015+. No 20-year-old HVAC or outdated floorplans to deal with.' },
      { icon: '📈', heading: 'Appreciation', body: 'Newer master-planned communities near Dell/Apple have appreciated faster than the Round Rock average over the last 5 years.' }
    ],
    nearby: ['teravista', 'mayfield-ranch', 'stone-canyon']
  },

  'behrens-ranch': {
    slug: 'behrens-ranch',
    name: 'Behrens Ranch',
    zips: ['78681'],
    subdivisionName: 'Behrens Ranch',
    priceRange: '$450K – $800K',
    medianPrice: '$575K',
    rentRange: '$2,300 – $3,700/mo',
    homeTypes: 'Established single-family, larger lots, mature trees, 3–5 bedrooms',
    schools: 'Round Rock ISD — Brushy Creek Elementary, Cedar Valley Middle, Round Rock High',
    commute: '22 min to Domain, 28 min to downtown, 18 min to Dell HQ',
    vibe: 'Established, mature trees, larger lots, top-rated schools, family-oriented',
    tags: ['Top Schools', 'Mature Trees', 'Larger Lots', 'Established', 'Round Rock High'],
    intro: [
      'Behrens Ranch is one of Round Rock\'s most desirable established neighborhoods. Built in the late 1990s and early 2000s, it sits in the 78681 zip code on Round Rock\'s southwest side — the side of the city closest to Austin proper and feeding into Round Rock High School.',
      'What distinguishes Behrens Ranch is the combination of larger lots (most homes sit on 1/4 acre or more), mature oak trees, and a school assignment to Round Rock High — one of the two most academically ranked high schools in the district. Buyers consistently pay a premium here specifically for that school assignment.',
      'Homes range from $450K to $800K. Expect 2,500–4,500 sqft on established lots. Resale velocity is fast — well-priced homes in Behrens Ranch typically go under contract within 1–2 weeks during a normal market.'
    ],
    highlights: [
      { icon: '🏆', label: 'Round Rock High Assignment', text: 'One of the highest-ranked high schools in Round Rock ISD' },
      { icon: '🌳', label: 'Mature Trees & Larger Lots', text: '1/4 acre+ lots with 20+ year oak canopy — rare in newer Round Rock builds' },
      { icon: '🏫', label: 'Brushy Creek Elementary', text: 'Neighborhood elementary with strong TEA ratings' },
      { icon: '📍', label: 'Southwest Round Rock Location', text: 'Closest side of Round Rock to Austin — shortest commute downtown' }
    ],
    faqs: [
      { q: 'What makes Behrens Ranch expensive?', a: 'Three things: the Round Rock High School assignment (families pay a premium to zone into it), larger lot sizes than most newer Round Rock communities, and mature tree canopy. Together they create a neighborhood that feels more like West Austin than suburban Round Rock.' },
      { q: 'Is Behrens Ranch in Round Rock ISD?', a: 'Yes. The neighborhood feeds into Brushy Creek Elementary, Cedar Valley Middle, and Round Rock High — considered one of the top 2 high schools in the district by TEA ratings and college placement.' },
      { q: 'How big are the lots?', a: 'Most Behrens Ranch lots are 1/4 acre (around 10,000 sqft) or larger. Some sections have 1/3 to 1/2 acre lots with pools. This is noticeably bigger than Teravista or Paloma Lake where typical lots are 5,000–7,000 sqft.' },
      { q: 'How fast do homes sell in Behrens Ranch?', a: 'In a normal market, well-priced Behrens Ranch homes typically go under contract within 7–14 days. The combination of school zoning and low inventory creates consistent demand.' }
    ],
    buyReasons: [
      { icon: '🏆', heading: 'Round Rock High', body: 'Buying into a Round Rock High-zoned neighborhood is one of the clearest school-premium plays in the Austin metro.' },
      { icon: '🌳', heading: 'Established Feel', body: 'Mature landscaping, bigger lots, and a settled community — rare to find this quality of neighborhood in Round Rock at this price.' },
      { icon: '📍', heading: 'Closest to Austin', body: 'Southwest Round Rock is closer to Austin proper — about 25–30 minutes to downtown, 15 to the Domain.' }
    ],
    nearby: ['brushy-creek', 'cat-hollow', 'mayfield-ranch']
  },

  'brushy-creek': {
    slug: 'brushy-creek',
    name: 'Brushy Creek',
    zips: ['78681'],
    subdivisionName: 'Brushy Creek',
    priceRange: '$420K – $700K',
    medianPrice: '$510K',
    rentRange: '$2,100 – $3,300/mo',
    homeTypes: 'Established single-family, 3–4 bedrooms, mix of original and updated',
    schools: 'Round Rock ISD — Brushy Creek Elementary, Cedar Valley Middle, Round Rock High',
    commute: '20 min to Domain, 27 min to downtown, 17 min to Dell HQ',
    vibe: 'Established, family-oriented, top schools, trail system, long-tenured residents',
    tags: ['Top Schools', 'Trails', 'Established', 'Round Rock High', 'Family'],
    intro: [
      'Brushy Creek is an established residential area in southwest Round Rock, built out primarily in the 1980s and 1990s. It sits in the 78681 zip code and feeds into Round Rock High School — the same school zone as Behrens Ranch — but with generally older homes and lower entry prices.',
      'The neighborhood is best known for two things: the Brushy Creek Regional Trail system (a 6.75-mile hike-and-bike corridor along Brushy Creek that connects to Cedar Park) and the stable, long-tenured community of residents. Many original owners are still here, giving the streets a settled, lived-in feel you can\'t fake.',
      'Homes range from $420K to $700K depending on age, updates, and lot size. Expect 1,800–3,200 sqft homes on 1/4 acre lots. This is a common first-time-homebuyer choice for families who want the Round Rock High zone but don\'t need a brand-new build.'
    ],
    highlights: [
      { icon: '🥾', label: 'Brushy Creek Regional Trail', text: '6.75 miles of hike-and-bike trail along Brushy Creek, connecting to Cedar Park' },
      { icon: '🏆', label: 'Round Rock High Zone', text: 'Same top-rated high school as Behrens Ranch — lower entry prices' },
      { icon: '🌳', label: 'Mature Neighborhood', text: '30+ year-old homes with established trees and landscaping' },
      { icon: '🏞️', label: 'Brushy Creek Lake Park', text: 'Fishing, kayaking, and picnic area just minutes from homes' }
    ],
    faqs: [
      { q: 'How old is Brushy Creek?', a: 'Most homes were built in the 1980s and 1990s, with some newer infill construction. You\'ll find a mix of original owners and updated remodels — condition varies widely.' },
      { q: 'Is Brushy Creek a good first-home option?', a: 'Yes. It\'s one of the most affordable ways into the Round Rock High zone, which is the main draw for many buyers. Homes in the $420–520K range are typical starter homes for families.' },
      { q: 'What\'s the Brushy Creek Regional Trail?', a: 'A 6.75-mile paved hike-and-bike trail running along Brushy Creek from Champions Park in Round Rock to Cedar Park. Residents access it from multiple neighborhood connection points.' },
      { q: 'Are there HOAs in Brushy Creek?', a: 'Some sections have HOAs, some don\'t — depends on the specific subdivision. Older sections often don\'t have HOAs, which is a draw for buyers who don\'t want monthly dues. Newer sections may have modest $25–50/month dues.' }
    ],
    buyReasons: [
      { icon: '💰', heading: 'Entry Price to Top Schools', body: 'Lowest-cost way into Round Rock High zone. Compare $450K Brushy Creek vs $600K Behrens Ranch for the same school assignment.' },
      { icon: '🥾', heading: 'Trail System', body: 'The Brushy Creek Regional Trail is one of the best hike-and-bike trails in the Austin metro. Most homes are within a 5-minute walk.' },
      { icon: '🏡', heading: 'Mature Community', body: 'Long-tenured residents and established landscaping — the opposite of a brand-new builder community.' }
    ],
    nearby: ['behrens-ranch', 'cat-hollow', 'forest-creek']
  },

  'mayfield-ranch': {
    slug: 'mayfield-ranch',
    name: 'Mayfield Ranch',
    zips: ['78681'],
    subdivisionName: 'Mayfield Ranch',
    priceRange: '$420K – $700K',
    medianPrice: '$500K',
    rentRange: '$2,100 – $3,200/mo',
    homeTypes: 'Master-planned, newer construction, 3–4 bedrooms, 2,000–3,500 sqft',
    schools: 'Leander ISD — Parkside Elementary, Stiles Middle, Rouse High',
    commute: '25 min to Domain, 32 min to downtown, 20 min to Dell HQ',
    vibe: 'Master-planned, Leander ISD, newer construction, amenity-rich, family',
    tags: ['Leander ISD', 'Master-Planned', 'New Construction', 'Amenities', 'Family'],
    intro: [
      'Mayfield Ranch is one of only a handful of Round Rock neighborhoods in Leander ISD instead of Round Rock ISD. This matters — Leander ISD has some of the highest TEA ratings in the Austin metro, and families specifically target Leander-zoned neighborhoods in Round Rock for the school quality.',
      'The community was built out from the mid-2000s through the late 2010s with 1,200+ homes across multiple phases. Amenities include a large community pool, splash pad, playground, and trail system connecting to Brushy Creek. The HOA is active and well-run — common areas are consistently maintained.',
      'Mayfield Ranch sits on the northwest side of Round Rock near the 183A toll road, giving residents fast access to Cedar Park, Leander, and the Domain. Expect $420–700K for 2,000–3,500 sqft homes — slightly cheaper than comparable Leander-zoned Cedar Park neighborhoods.'
    ],
    highlights: [
      { icon: '🏆', label: 'Leander ISD Schools', text: 'Parkside Elementary, Stiles Middle, Rouse High — all highly rated' },
      { icon: '🏊', label: 'Community Amenities', text: 'Pool, splash pad, playground, trails connecting to Brushy Creek' },
      { icon: '🚗', label: '183A Toll Access', text: 'Direct access to 183A — fastest route to Domain, Cedar Park, and Austin' },
      { icon: '🏗️', label: 'Newer Construction', text: 'Most homes built 2005–2019, modern floor plans and energy-efficient construction' }
    ],
    faqs: [
      { q: 'Why is Mayfield Ranch in Leander ISD?', a: 'Round Rock\'s western and northwestern edges cross the Leander ISD boundary. The district line was drawn in the 1980s based on population at the time. Mayfield Ranch happens to fall just on the Leander side, even though the mailing address is Round Rock.' },
      { q: 'Is Leander ISD better than Round Rock ISD?', a: 'Both are strong districts. Leander ISD has historically had slightly higher TEA ratings and test scores, particularly at the high school level. Rouse High (the Mayfield Ranch feeder) is consistently ranked in the top 20 Texas high schools.' },
      { q: 'What\'s the HOA fee in Mayfield Ranch?', a: 'HOA dues run about $50–70/month and cover pool access, common areas, playground maintenance, and landscaping of entry monuments. Some sections may have an additional amenity fee.' },
      { q: 'How far is Mayfield Ranch from Dell HQ?', a: 'About 20 minutes via 183A and the Parmer Lane corridor. Longer than Forest Creek or Brushy Creek which are adjacent to Dell, but the Leander ISD zoning offsets the additional drive for most families.' }
    ],
    buyReasons: [
      { icon: '🏆', heading: 'Leander ISD in Round Rock', body: 'Get Leander ISD schools without Cedar Park or Leander prices. Rouse High is nationally ranked.' },
      { icon: '🏗️', heading: 'Modern Construction', body: 'Most homes are 10–20 years old with modern floor plans — way fewer repair headaches than 1990s builds.' },
      { icon: '🚗', heading: 'Toll Road Access', body: '183A direct access makes Domain, Cedar Park, and Lakeline Station commutes significantly faster than I-35.' }
    ],
    nearby: ['behrens-ranch', 'brushy-creek', 'cat-hollow']
  },

  'cat-hollow': {
    slug: 'cat-hollow',
    name: 'Cat Hollow',
    zips: ['78681'],
    subdivisionName: 'Cat Hollow',
    priceRange: '$400K – $625K',
    medianPrice: '$475K',
    rentRange: '$2,000 – $3,000/mo',
    homeTypes: 'Established single-family, 3–4 bedrooms, mature trees',
    schools: 'Round Rock ISD — Great Oaks Elementary, Cedar Valley Middle, Round Rock High',
    commute: '22 min to Domain, 28 min to downtown, 17 min to Dell HQ',
    vibe: 'Established family community, top schools, mature trees, consistent resale',
    tags: ['Round Rock High', 'Established', 'Family', 'Mature Trees'],
    intro: [
      'Cat Hollow is an established family neighborhood in southwest Round Rock, built out primarily in the 1990s. Like Behrens Ranch and Brushy Creek, it feeds into Round Rock High — one of the top-rated high schools in the district — which drives consistent buyer demand and stable home values.',
      'The neighborhood is characterized by mature tree canopy, good-sized lots (around 1/4 acre on average), and a settled community with many long-tenured owners. Homes are typically 1,800–3,200 sqft ranch-style or two-story builds from the 1990s to early 2000s.',
      'Cat Hollow is a popular pick for families who want the Round Rock High zone without the premium of Behrens Ranch. Expect to find homes between $400K and $625K depending on age, condition, and updates.'
    ],
    highlights: [
      { icon: '🏆', label: 'Round Rock High Zoning', text: 'Feeds into Round Rock High — same top-rated high school as Behrens Ranch' },
      { icon: '🌳', label: 'Mature Canopy', text: '30+ year-old trees and established landscaping' },
      { icon: '🏫', label: 'Great Oaks Elementary', text: 'Neighborhood elementary with strong TEA ratings' },
      { icon: '💰', label: 'Value Pricing', text: 'Lower entry than Behrens Ranch or Mayfield Ranch for the same school quality' }
    ],
    faqs: [
      { q: 'Is Cat Hollow a good family neighborhood?', a: 'Yes — it\'s one of the most consistent family neighborhoods in Round Rock. Mature trees, good schools, settled community, and regular resale activity keep values stable.' },
      { q: 'What school does Cat Hollow feed into?', a: 'Great Oaks Elementary → Cedar Valley Middle → Round Rock High. Same high school assignment as Behrens Ranch and Brushy Creek, all in the 78681 zip code.' },
      { q: 'Does Cat Hollow have HOA fees?', a: 'Some sections do, some don\'t. Fees in the sections that do are generally modest ($25–50/month). Always verify HOA status during the title/contract review on a specific property.' },
      { q: 'How old are homes in Cat Hollow?', a: 'Most homes were built between 1990 and 2005. Condition varies widely — some are completely original, others have been fully remodeled. Updated homes command a premium.' }
    ],
    buyReasons: [
      { icon: '💰', heading: 'Value for Schools', body: 'One of the cheapest entries into Round Rock High zoning. For families prioritizing schools on a budget, this is the sweet spot.' },
      { icon: '🌳', heading: 'Mature Feel', body: 'Established landscaping, bigger trees, and a settled streetscape — feels like a real neighborhood, not a brand-new development.' },
      { icon: '📈', heading: 'Stable Resale', body: 'Long-term resale activity is stable — school-zoned family neighborhoods don\'t crash in down markets.' }
    ],
    nearby: ['brushy-creek', 'behrens-ranch', 'mayfield-ranch']
  },

  'stone-canyon': {
    slug: 'stone-canyon',
    name: 'Stone Canyon',
    zips: ['78681'],
    subdivisionName: 'Stone Canyon',
    priceRange: '$475K – $800K',
    medianPrice: '$595K',
    rentRange: '$2,400 – $3,700/mo',
    homeTypes: 'Master-planned, larger homes, 3–5 bedrooms, many with greenbelt views',
    schools: 'Round Rock ISD — Fern Bluff Elementary, Cedar Valley Middle, Round Rock High',
    commute: '25 min to Domain, 30 min to downtown, 20 min to Dell HQ',
    vibe: 'Newer master-planned, family-focused, top schools, amenity-rich, greenbelts',
    tags: ['Master-Planned', 'Round Rock High', 'Greenbelts', 'Amenities', 'Family'],
    intro: [
      'Stone Canyon is one of Round Rock\'s most established master-planned communities — built out between the late 1990s and mid-2000s with approximately 1,800 homes. Located in the 78681 zip on the west side of Round Rock, it feeds into Fern Bluff Elementary, Cedar Valley Middle, and Round Rock High.',
      'The community is organized around a large community center with pools, tennis courts, trails, and a lake. Many homes sit on greenbelt lots with direct trail access — rare in a neighborhood this size. Stone Canyon\'s reputation is built on consistent quality: the HOA is active, common areas are well-maintained, and resale values have held steady through market cycles.',
      'Expect $475K to $800K for 2,500–4,500 sqft homes. This is a clear step up from Cat Hollow or Brushy Creek in terms of lot size and home size, but similar schools and commute profiles.'
    ],
    highlights: [
      { icon: '🏆', label: 'Round Rock High', text: 'Feeds into Round Rock High — top academic ranking in the district' },
      { icon: '🏊', label: 'Community Center', text: 'Pool, tennis, clubhouse, and 300+ acres of parks and trails' },
      { icon: '🌳', label: 'Greenbelt Lots', text: 'Many homes back to greenbelts with direct trail access' },
      { icon: '🏡', label: 'Larger Homes', text: 'Typical home is 2,800–4,000 sqft on larger lots than newer Round Rock builds' }
    ],
    faqs: [
      { q: 'How is Stone Canyon different from Teravista?', a: 'Stone Canyon is older (built 1998–2006 vs Teravista\'s 2005–2020), smaller (1,800 homes vs 1,700), and has bigger lots. Schools are different — Stone Canyon feeds Round Rock High, Teravista feeds Stony Point.' },
      { q: 'Does Stone Canyon have a golf course?', a: 'No, Stone Canyon doesn\'t have an in-neighborhood course. The closest golf is at Forest Creek Golf Club (5 minutes) or Teravista Golf Course (8 minutes).' },
      { q: 'What\'s the HOA fee?', a: 'HOA dues run approximately $60–90/month. This covers the community center access, pool, tennis courts, common areas, and trail maintenance. Some older sections may have slightly different fee structures.' },
      { q: 'Is Stone Canyon a good resale market?', a: 'Yes — Stone Canyon is one of the more stable resale markets in Round Rock. The combination of Round Rock High zoning, established community, and consistent HOA management supports steady demand.' }
    ],
    buyReasons: [
      { icon: '🏆', heading: 'Top School Zone', body: 'Round Rock High is nationally ranked. Stone Canyon is the largest master-planned community in that zone.' },
      { icon: '🌳', heading: 'Greenbelt Living', body: 'Many lots back directly to protected greenbelts with trail access — rare in newer Round Rock subdivisions.' },
      { icon: '🏡', heading: 'Larger Homes & Lots', body: 'Steps up in square footage and lot size from Cat Hollow or Brushy Creek at a reasonable premium.' }
    ],
    nearby: ['behrens-ranch', 'cat-hollow', 'mayfield-ranch']
  },

  'sonoma': {
    slug: 'sonoma',
    name: 'Sonoma',
    zips: ['78665'],
    subdivisionName: 'Sonoma',
    priceRange: '$380K – $600K',
    medianPrice: '$460K',
    rentRange: '$2,000 – $3,100/mo',
    homeTypes: 'Master-planned, 3–4 bedrooms, 2,000–3,200 sqft, some with greenbelts',
    schools: 'Round Rock ISD — Herrington Elementary, Hopewell Middle, Stony Point High',
    commute: '23 min to Domain, 30 min to downtown, 14 min to Dell HQ',
    vibe: 'Master-planned, amenity-rich, family-friendly, value-oriented, newer construction',
    tags: ['Master-Planned', 'Round Rock ISD', 'Pools', 'Family', 'Value'],
    intro: [
      'Sonoma is a master-planned community in northeast Round Rock (78665 zip) built out primarily between 2000 and 2015. The neighborhood has over 2,000 homes across multiple phases, making it one of the larger communities in Round Rock.',
      'Amenities are a strong draw — two community pools, a large amenity center, playgrounds, sports courts, and an extensive trail system connecting different phases. Sonoma is also known for its active community events and volunteer-driven HOA culture.',
      'Home prices here are among Round Rock\'s best values for a newer master-planned community — expect $380K to $600K for 2,000–3,200 sqft homes. This is a common choice for first-time move-up buyers who want modern amenities without paying Behrens Ranch or Teravista premiums.'
    ],
    highlights: [
      { icon: '🏊', label: 'Two Community Pools', text: 'Plus splash pad and family pool area' },
      { icon: '🏫', label: 'Herrington Elementary', text: 'Highly-rated neighborhood elementary school' },
      { icon: '💰', label: 'Strong Value', text: 'Lower price-per-sqft than Teravista or Stone Canyon' },
      { icon: '🏗️', label: 'Modern Construction', text: 'Most homes 10–25 years old with newer floor plans than Forest Creek or Cat Hollow' }
    ],
    faqs: [
      { q: 'How does Sonoma compare to Teravista?', a: 'Sonoma is smaller, more affordable, and has different amenities (no golf course). Both are in the 78665 zip and feed into similar schools (Hopewell Middle, Stony Point High). Sonoma typically offers more sqft per dollar.' },
      { q: 'What\'s the HOA fee in Sonoma?', a: 'About $60–90/month. Covers pool access, amenity center, playground maintenance, and common areas. Sonoma\'s HOA is considered active and well-managed.' },
      { q: 'Is Sonoma a good first-home community?', a: 'Yes — it\'s one of the most popular first-home communities in Round Rock for young families. Entry prices around $380–450K get you into a 2,000+ sqft modern home in good schools.' },
      { q: 'What high school does Sonoma feed into?', a: 'Stony Point High School via Hopewell Middle School. Stony Point is a large comprehensive high school with strong programs in STEM and athletics.' }
    ],
    buyReasons: [
      { icon: '💰', heading: 'Best Value in RR', body: 'One of the cheapest entries into a modern master-planned community in Round Rock. Similar homes in Mueller would be double.' },
      { icon: '🏊', heading: 'Real Amenities', body: 'Two pools, amenity center, trails — punches above its price point in community features.' },
      { icon: '📍', heading: 'Dell Adjacent', body: '14 minutes to Dell HQ via 130 toll — one of the shortest commutes from northeast Round Rock.' }
    ],
    nearby: ['paloma-lake', 'teravista', 'mayfield-ranch']
  },

  'vista-oaks': {
    slug: 'vista-oaks',
    name: 'Vista Oaks',
    zips: ['78681'],
    subdivisionName: 'Vista Oaks',
    priceRange: '$380K – $575K',
    medianPrice: '$450K',
    rentRange: '$1,900 – $2,900/mo',
    homeTypes: 'Established single-family, 3–4 bedrooms, mature trees, mid-priced',
    schools: 'Round Rock ISD — Purple Sage Elementary, Cedar Valley Middle, Round Rock High',
    commute: '23 min to Domain, 29 min to downtown, 18 min to Dell HQ',
    vibe: 'Established, quiet, mature trees, family-friendly, top-rated high school',
    tags: ['Round Rock High', 'Established', 'Value', 'Mature Trees', 'Family'],
    intro: [
      'Vista Oaks is an established residential neighborhood on the southwest side of Round Rock (78681), built primarily in the 1990s. It\'s part of the Round Rock High attendance zone — the same school zone as Behrens Ranch, Brushy Creek, Cat Hollow, and Stone Canyon — which keeps demand steady.',
      'What makes Vista Oaks different from its neighbors: lower entry prices and smaller typical home sizes. This is an entry-level neighborhood in the Round Rock High zone, with homes typically 1,800–2,800 sqft. For buyers who care most about school assignment and less about home size, Vista Oaks is one of the best values in Round Rock.',
      'Expect homes between $380K and $575K. The streets are lined with mature oak trees, lots are typical 6,000–9,000 sqft, and the neighborhood has a quiet, settled feel you don\'t get in newer master-planned communities.'
    ],
    highlights: [
      { icon: '🏆', label: 'Round Rock High', text: 'Same top high school as Behrens Ranch and Stone Canyon — at a lower entry price' },
      { icon: '🌳', label: 'Mature Trees', text: '30+ year oak canopy and established landscaping' },
      { icon: '💰', label: 'Lowest RR High Entry', text: 'One of the most affordable ways to buy into the Round Rock High zone' },
      { icon: '🏡', label: 'Quiet Established Streets', text: 'Long-tenured residents, settled feel, low turnover' }
    ],
    faqs: [
      { q: 'Why is Vista Oaks cheaper than Behrens Ranch?', a: 'Smaller homes (1,800–2,800 sqft vs 2,500–4,500 sqft), smaller lots, and less curb-appeal updating. But they share the same Round Rock High assignment and same 78681 zip. For budget-conscious buyers who prioritize schools, this is a major value play.' },
      { q: 'What school does Vista Oaks feed into?', a: 'Purple Sage Elementary → Cedar Valley Middle → Round Rock High. Round Rock High is consistently rated in the top tier of RRISD schools.' },
      { q: 'Are the homes in Vista Oaks updated?', a: 'Varies widely. Some have been completely remodeled, others are totally original from the 1990s. This is a neighborhood where buyers can find value in cosmetically-dated homes that just need updating.' },
      { q: 'Does Vista Oaks have an HOA?', a: 'Some sections do, some don\'t. Most sections with an HOA have modest fees ($25–40/month). Check the specific section before purchasing.' }
    ],
    buyReasons: [
      { icon: '💰', heading: 'Cheapest Round Rock High Entry', body: 'For families who care most about school assignment, Vista Oaks is one of the most efficient ways to buy into that zone.' },
      { icon: '🔨', heading: 'Remodel Potential', body: 'Original 1990s homes at a discount — buy, update, and build equity. Common strategy in this neighborhood.' },
      { icon: '🌳', heading: 'Settled Community', body: 'Mature trees, established streets, long-tenured residents — the opposite of a builder spec subdivision.' }
    ],
    nearby: ['cat-hollow', 'brushy-creek', 'behrens-ranch']
  }
};
