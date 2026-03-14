// Seed script — inserts sample Austin listings for local preview
require('dotenv').config();
const db = require('./db/database');

const listings = [
  {
    listing_key: 'SAMPLE001', listing_id: 'AUS-001', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 649000, bedrooms_total: 4, bathrooms_total: 3, bathrooms_full: 3,
    living_area: 2450, lot_size_acres: 0.18, year_built: 2019, garage_spaces: 2,
    unparsed_address: '4821 Shoal Creek Blvd', city: 'Austin', state_or_province: 'TX',
    postal_code: '78756', county: 'Travis', subdivision_name: 'Allandale',
    latitude: 30.3432, longitude: -97.7391, school_district: 'Austin ISD',
    elementary_school: 'Gullett', middle_school: 'Lamar', high_school: 'McCallum',
    days_on_market: 5, listing_contract_date: '2024-01-10',
    public_remarks: 'Stunning modern craftsman in highly sought-after Allandale neighborhood. Chef\'s kitchen with quartz counters, custom cabinetry and high-end stainless appliances. Open floor plan with soaring ceilings. Primary suite features spa bath with walk-in shower and soaking tub. Large backyard with covered patio perfect for entertaining. Walking distance to restaurants and Shoal Creek Trail.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=800',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800',
      'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=800',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE002', listing_id: 'AUS-002', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 1250000, bedrooms_total: 5, bathrooms_total: 4, bathrooms_full: 4,
    living_area: 4100, lot_size_acres: 0.32, year_built: 2021, garage_spaces: 3,
    unparsed_address: '2105 Barton Hills Dr', city: 'Austin', state_or_province: 'TX',
    postal_code: '78704', county: 'Travis', subdivision_name: 'Barton Hills',
    latitude: 30.2498, longitude: -97.7740, school_district: 'Austin ISD',
    elementary_school: 'Barton Hills', middle_school: 'O. Henry', high_school: 'Austin',
    days_on_market: 12, listing_contract_date: '2024-01-03',
    public_remarks: 'Luxurious contemporary home in coveted Barton Hills just minutes from Barton Springs Pool and Zilker Park. Expansive open concept living with floor-to-ceiling windows capturing panoramic Hill Country views. Gourmet kitchen with professional-grade Wolf appliances. Resort-style pool and spa. Three-car garage with EV charging. Smart home throughout.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0,
    pool_features: 'In Ground, Heated, Spa',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE003', listing_id: 'AUS-003', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Condominium',
    list_price: 389000, bedrooms_total: 2, bathrooms_total: 2, bathrooms_full: 2,
    living_area: 1180, lot_size_acres: null, year_built: 2018, garage_spaces: 1,
    unparsed_address: '360 Nueces St #1504', city: 'Austin', state_or_province: 'TX',
    postal_code: '78701', county: 'Travis', subdivision_name: 'Downtown Austin',
    latitude: 30.2672, longitude: -97.7501, school_district: 'Austin ISD',
    elementary_school: 'Mathews', middle_school: 'O. Henry', high_school: 'Austin',
    days_on_market: 18, listing_contract_date: '2023-12-28',
    public_remarks: 'Stunning 15th floor condo at the iconic 360 Condominiums in the heart of downtown Austin. Floor-to-ceiling windows with breathtaking views of Lady Bird Lake and the city skyline. Sleek modern finishes throughout. Resort amenities including rooftop pool, fitness center, and 24hr concierge. Walk to top restaurants, entertainment, and Lady Bird Lake hike and bike trail.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    association_fee: 650, association_fee_frequency: 'Monthly',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE004', listing_id: 'AUS-004', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 485000, bedrooms_total: 3, bathrooms_total: 2, bathrooms_full: 2,
    living_area: 1890, lot_size_acres: 0.21, year_built: 1998, garage_spaces: 2,
    unparsed_address: '7612 Fireoak Dr', city: 'Austin', state_or_province: 'TX',
    postal_code: '78759', county: 'Travis', subdivision_name: 'Balcones Village',
    latitude: 30.4115, longitude: -97.7674, school_district: 'Round Rock ISD',
    elementary_school: 'Kathy Caraway', middle_school: 'Canyon Vista', high_school: 'Westwood',
    days_on_market: 3, listing_contract_date: '2024-01-12',
    public_remarks: 'Beautifully updated home in award-winning Round Rock ISD (Westwood High School). Fresh interior paint, updated kitchen with granite counters and stainless appliances. Hardwood floors throughout main living areas. Large primary suite with updated bath. Mature trees on oversized lot with playset. Quiet cul-de-sac street. Easy access to 183, Arboretum, and Domain.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1570129477492-45c003edd2be?w=800',
      'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800',
      'https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE005', listing_id: 'AUS-005', standard_status: 'Coming Soon',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 875000, bedrooms_total: 4, bathrooms_total: 3, bathrooms_full: 3,
    living_area: 3200, lot_size_acres: 0.28, year_built: 2023, garage_spaces: 2,
    unparsed_address: '1834 Exposition Blvd', city: 'Austin', state_or_province: 'TX',
    postal_code: '78703', county: 'Travis', subdivision_name: 'Tarrytown',
    latitude: 30.2916, longitude: -97.7724, school_district: 'Austin ISD',
    elementary_school: 'Casis', middle_school: 'O. Henry', high_school: 'Austin',
    days_on_market: 0, listing_contract_date: '2024-01-15',
    public_remarks: 'Brand new construction in prestigious Tarrytown — one of Austin\'s most coveted neighborhoods. Masterfully crafted with designer finishes throughout. Open kitchen/living concept, butler\'s pantry, and wine room. Primary retreat with spa-like bath and custom closet. Covered back porch with outdoor kitchen rough-in. Steps to Lake Austin Blvd restaurants and Pease Park.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 1, pool_features: null,
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1613977257592-4871e5fcd7c4?w=800',
      'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800',
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE006', listing_id: 'AUS-006', standard_status: 'Active Under Contract',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 529000, bedrooms_total: 3, bathrooms_total: 2, bathrooms_full: 2,
    living_area: 1740, lot_size_acres: 0.15, year_built: 2015, garage_spaces: 2,
    unparsed_address: '9823 Collinfield Dr', city: 'Austin', state_or_province: 'TX',
    postal_code: '78748', county: 'Travis', subdivision_name: 'Shady Hollow',
    latitude: 30.1692, longitude: -97.8108, school_district: 'Austin ISD',
    elementary_school: 'Cowan', middle_school: 'Bailey', high_school: 'Akins',
    days_on_market: 7, listing_contract_date: '2024-01-08',
    public_remarks: 'Move-in ready gem in South Austin\'s beloved Shady Hollow community. Light-filled open floor plan with high ceilings and beautiful LVP flooring. Kitchen features white cabinets, subway tile backsplash, and gas range. Large primary suite with walk-in closet. Covered patio and private backyard. Community amenities including pool, tennis courts, and greenbelts.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    association_fee: 180, association_fee_frequency: 'Annually',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=800',
      'https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE007', listing_id: 'AUS-007', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 1895000, bedrooms_total: 5, bathrooms_total: 5, bathrooms_full: 4, bathrooms_half: 1,
    living_area: 5200, lot_size_acres: 0.85, year_built: 2020, garage_spaces: 3,
    unparsed_address: '4512 Westlake Dr', city: 'West Lake Hills', state_or_province: 'TX',
    postal_code: '78746', county: 'Travis', subdivision_name: 'Westlake Estates',
    latitude: 30.2805, longitude: -97.8012, school_district: 'Eanes ISD',
    elementary_school: 'Forest Trail', middle_school: 'Hill Country', high_school: 'Westlake',
    days_on_market: 21, listing_contract_date: '2023-12-25',
    public_remarks: 'Exceptional estate in the heart of Westlake Hills within the nationally ranked Eanes ISD. Magazine-worthy finishes throughout this 5,200 sqft masterpiece. Grand two-story foyer, chef\'s kitchen with La Cornue range, climate-controlled wine cellar, and media room. Resort pool and spa on nearly an acre. Oversized 3-car garage. The pinnacle of Austin luxury living.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0,
    pool_features: 'In Ground, Heated, Spa, Waterfall',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1600607687644-c7171b42498b?w=800',
      'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE008', listing_id: 'AUS-008', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Townhouse',
    list_price: 425000, bedrooms_total: 3, bathrooms_total: 3, bathrooms_full: 2, bathrooms_half: 1,
    living_area: 1650, lot_size_acres: 0.04, year_built: 2022, garage_spaces: 1,
    unparsed_address: '1203 E 6th St #B', city: 'Austin', state_or_province: 'TX',
    postal_code: '78702', county: 'Travis', subdivision_name: 'East Austin',
    latitude: 30.2602, longitude: -97.7289, school_district: 'Austin ISD',
    elementary_school: 'Govalle', middle_school: 'Martin', high_school: 'Eastside Memorial',
    days_on_market: 9, listing_contract_date: '2024-01-06',
    public_remarks: 'Sleek new construction townhome in the heart of East Austin\'s vibrant entertainment district. Designer finishes throughout including quartz counters, wide plank white oak floors, and Bosch appliances. Private rooftop terrace with downtown views — perfect for entertaining. Walk to some of Austin\'s best bars, restaurants, and coffee shops. Low maintenance living at its finest.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 1, pool_features: null,
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1600573472592-401b489a3cdc?w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE009', listing_id: 'AUS-009', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 595000, bedrooms_total: 4, bathrooms_total: 3, bathrooms_full: 3,
    living_area: 2680, lot_size_acres: 0.22, year_built: 2016, garage_spaces: 2,
    unparsed_address: '3401 Speedway Ave', city: 'Round Rock', state_or_province: 'TX',
    postal_code: '78681', county: 'Williamson', subdivision_name: 'Walsh Ranch',
    latitude: 30.5083, longitude: -97.6789, school_district: 'Round Rock ISD',
    elementary_school: 'Callison', middle_school: 'Grisham', high_school: 'Round Rock',
    days_on_market: 14, listing_contract_date: '2024-01-01',
    public_remarks: 'Spacious and well-appointed home in master-planned Walsh Ranch community. Bright open floor plan with formal dining, study, and large family room with fireplace. Updated kitchen with island, gas cooktop, and double ovens. Downstairs guest suite. Primary retreat upstairs with sitting area and luxurious bath. Large game room. Community amenities: pool, splash pad, tennis, and miles of trails.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    association_fee: 660, association_fee_frequency: 'Annually',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800',
      'https://images.unsplash.com/photo-1600047509358-9dc75507daeb?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE010', listing_id: 'AUS-010', standard_status: 'Active',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 749000, bedrooms_total: 4, bathrooms_total: 3, bathrooms_full: 3,
    living_area: 2950, lot_size_acres: 0.19, year_built: 2017, garage_spaces: 2,
    unparsed_address: '5821 Mesa Dr', city: 'Austin', state_or_province: 'TX',
    postal_code: '78731', county: 'Travis', subdivision_name: 'Northwest Hills',
    latitude: 30.3612, longitude: -97.7589, school_district: 'Austin ISD',
    elementary_school: 'Doss', middle_school: 'Murchison', high_school: 'Anderson',
    days_on_market: 6, listing_contract_date: '2024-01-09',
    public_remarks: 'Gorgeous updated home in Northwest Hills with stunning views from the hilltop lot. Open concept main living with vaulted ceilings and abundant natural light. Completely remodeled kitchen with custom cabinetry and quartz waterfall island. Separate guest suite on main floor. Primary suite with private balcony and panoramic views. Entertainer\'s backyard with pool, spa, and outdoor kitchen.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0,
    pool_features: 'In Ground, Spa',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=800',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE011', listing_id: 'AUS-011', standard_status: 'Active',
    property_type: 'Residential Lease', property_sub_type: 'Single Family Residence',
    list_price: 3200, bedrooms_total: 3, bathrooms_total: 2, bathrooms_full: 2,
    living_area: 1650, lot_size_acres: 0.14, year_built: 2010, garage_spaces: 2,
    unparsed_address: '2234 Govalle Ave', city: 'Austin', state_or_province: 'TX',
    postal_code: '78702', county: 'Travis', subdivision_name: 'East Austin',
    latitude: 30.2564, longitude: -97.7153, school_district: 'Austin ISD',
    elementary_school: 'Govalle', middle_school: 'Martin', high_school: 'Eastside Memorial',
    days_on_market: 4, listing_contract_date: '2024-01-11',
    public_remarks: 'Charming East Austin bungalow for lease in one of the city\'s most walkable neighborhoods. Updated kitchen, hardwood floors throughout, and large backyard with deck. Two-car garage. Pets negotiable. Close to Mueller, HEB, and tons of great restaurants and coffee shops. Available February 1st.',
    list_agent_full_name: 'Sarah Mitchell', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800'
    ]), modification_timestamp: new Date().toISOString()
  },
  {
    listing_key: 'SAMPLE012', listing_id: 'AUS-012', standard_status: 'Pending',
    property_type: 'Residential', property_sub_type: 'Single Family Residence',
    list_price: 320000, bedrooms_total: 3, bathrooms_total: 2, bathrooms_full: 2,
    living_area: 1420, lot_size_acres: 0.16, year_built: 2005, garage_spaces: 2,
    unparsed_address: '412 Lehman Rd', city: 'Cedar Park', state_or_province: 'TX',
    postal_code: '78613', county: 'Williamson', subdivision_name: 'Ranch at Brushy Creek',
    latitude: 30.5051, longitude: -97.7982, school_district: 'Leander ISD',
    elementary_school: 'Lois F. Giddens', middle_school: 'Running Brushy', high_school: 'Leander',
    days_on_market: 2, listing_contract_date: '2024-01-13',
    public_remarks: 'Great starter home in Cedar Park\'s popular Ranch at Brushy Creek. Well-maintained 3/2 with open living/dining/kitchen layout. New roof 2022, HVAC 2021. Large backyard with mature trees. Community pool and playground. Excellent Leander ISD schools. Close to 1890 Ranch shopping, dining, and entertainment. Easy commute to Austin via 183A.',
    list_agent_full_name: 'James Rodriguez', list_office_name: 'Austin TX Homes',
    mlg_can_view: 1, waterfront_yn: 0, new_construction_yn: 0, pool_features: null,
    association_fee: 480, association_fee_frequency: 'Annually',
    photos: JSON.stringify([
      'https://images.unsplash.com/photo-1571055107559-3e67626fa8be?w=800',
      'https://images.unsplash.com/photo-1583608205776-bfd35f0d9f83?w=800'
    ]), modification_timestamp: new Date().toISOString()
  }
];

const insert = db.prepare(`
  INSERT OR REPLACE INTO listings (
    listing_key, listing_id, standard_status, property_type, property_sub_type,
    list_price, bedrooms_total, bathrooms_total, bathrooms_full, bathrooms_half,
    living_area, lot_size_acres, year_built, garage_spaces,
    unparsed_address, city, state_or_province, postal_code, county, subdivision_name,
    latitude, longitude, public_remarks,
    list_agent_full_name, list_office_name,
    elementary_school, middle_school, high_school, school_district,
    days_on_market, listing_contract_date,
    mlg_can_view, waterfront_yn, new_construction_yn, pool_features,
    association_fee, association_fee_frequency, photos, modification_timestamp
  ) VALUES (
    @listing_key, @listing_id, @standard_status, @property_type, @property_sub_type,
    @list_price, @bedrooms_total, @bathrooms_total, @bathrooms_full, @bathrooms_half,
    @living_area, @lot_size_acres, @year_built, @garage_spaces,
    @unparsed_address, @city, @state_or_province, @postal_code, @county, @subdivision_name,
    @latitude, @longitude, @public_remarks,
    @list_agent_full_name, @list_office_name,
    @elementary_school, @middle_school, @high_school, @school_district,
    @days_on_market, @listing_contract_date,
    @mlg_can_view, @waterfront_yn, @new_construction_yn, @pool_features,
    @association_fee, @association_fee_frequency, @photos, @modification_timestamp
  )
`);

const insertAll = db.transaction(rows => rows.forEach(r => insert.run(r)));
insertAll(listings);

console.log(`✅ Seeded ${listings.length} sample Austin listings.`);
console.log('   Start the server with: npm start');
console.log('   Then open: http://localhost:3000');
process.exit(0);
