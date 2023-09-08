// Author: George Woolsey (george.woolsey@colostate.edu)
// last updated: 2023-09-05
// description: this is the code to be published with journal article
////////////////////////////////////////////////////////////////////////////////////////////////////
// BEGIN: USER-DEFINED PARAMETERS AND DATA
////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////
  // 1. DEFINE DATA TO CALC CONSTRAINTS IN BOUNDS
  // CAN USE A GEE DATA SOURCE
  // .. OR UPLOAD CUSTOM DATA SOURCE:
  // ... https://developers.google.com/earth-engine/guides/table_upload
  //////////////////////////////////////////////////
    // define feature filtering list
    var ft_list = ee.List([
      'Plumas Community Protection'
      , 'Pine Valley'
    ]);
    var my_feature_collection = 
    ///////////////// wildfire priority landscapes
      ee.FeatureCollection("projects/forestmgmtconstraint/assets/Wildfire_Crisis_Strategy_Landscapes")
      // which column should be filtered? ... comment out filter to use all features in data
      .filter(ee.Filter.inList('NAME', ft_list))
    ;
    print(my_feature_collection.aggregate_array('NAME'), 'FORESTS TO DO' );
  //////////////////////////////////////////////////
  // 2. DEFINE NLCD LANDCOVER CLASSES TO CONSIDER
  // SEE:
  // .. https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description
  //////////////////////////////////////////////////
    // A list of NLCD cover classes
      var nlcd_class_list = [41,42,43,51,52];
  //////////////////////////////////////////////////
  // 3. CONSTRAINT PARAMETERS
  //////////////////////////////////////////////////
    // A) HOW FAR (FEET) FROM EXISTING ROADS CAN TREATMENT BE APPLIED?
      var dist_from_road_feet = 1000;
    // B) WHAT IS THE MAXIMUM SLOPE (%) ON WHICH TREATMENT CAN BE APPLIED?
      var max_slope_pct = 40;
    // C) HOW FAR (FEET) FROM RIPARIAN ZONES SHOULD TREATMENT BE CONSTRAINED?
      var riparian_buffer_feet = 100;
    // D) ON WHICH LAND DESIGNATION AREAS IS MECHANICAL PROHIBITED BY GAP STATUS CODE?
      // .. options = 1,2,3,4 alone or in combination
      // see: https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview
      var gap_status_list = [1];
    // E) PROHIBIT MECHANICAL USE WITHIN ADMINISTRATIVE BOUNDARIES?
      // [1] = yes; [0] = no
      var use_admin_yes1_no0 = [1]; 
  //////////////////////////////////////////////////
  // 4. NAME EXPORT FILES PREFIX
  //////////////////////////////////////////////////
    var my_export_prefix = 'wfpriority_all_sc1';
////////////////////////////////////////////////////////////////////////////////////////////////////
// END: USER-DEFINED PARAMETERS AND DATA
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// LOAD ALL DATA FOR ANALYSIS
////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////
  // SET SWITCH TO INCLUDE ADMIN OR NOT...DON'T CHANGE
  //////////////////////////////////////////////////
  var is_this_a_one_fn = function(number) {
    number = ee.Number(number);   // Cast the input to a Number so we can use mod.
    var is_one = number.eq(1);
    return ee.Number(is_one);
  };
  var admin_mask_this = ee.List(use_admin_yes1_no0.map(is_this_a_one_fn)).get(0);
  // print(admin_mask_this,'admin_mask_this');
  //////////////////////////////////////////////////
  // Import the NLCD collection.
  //////////////////////////////////////////////////
  var nlcd = ee.ImageCollection("USGS/NLCD_RELEASES/2019_REL/NLCD")
    // The collection contains images for multiple years and regions in the USA.  
    // Filter the collection to the 2019 product.
    .filter(ee.Filter.eq('system:index', '2019'))
    // Each product has multiple bands for describing aspects of land cover.
    // Select the land cover band.
    .select('landcover')
  ;
  //////////////////////////////////////////////////
  // PAD-US DATA
  //////////////////////////////////////////////////
  var pad_designation = ee.FeatureCollection('USGS/GAP/PAD-US/v20/designation');
  var pad_easement = ee.FeatureCollection('USGS/GAP/PAD-US/v20/easement');
  var pad_fee = ee.FeatureCollection('USGS/GAP/PAD-US/v20/fee');
  var pad_proclamation = ee.FeatureCollection('USGS/GAP/PAD-US/v20/proclamation');
  // combine all pad features
  var padus = 
    ee.FeatureCollection([
      pad_designation
      , pad_easement
      , pad_fee
      , pad_proclamation
    ])
    .flatten()
  ;
  //////////////////////////////////////////////////
  // SLOPE DATA (FROM ELEVATION DEM)
  //////////////////////////////////////////////////
    var elev = ee.Image("USGS/3DEP/10m");
    var slope = ee.Terrain.slope(elev)
      //convert from degrees to percent slope
      .divide(180)
      .multiply(Math.PI)
      .tan()
      .multiply(100)
    ;
  //////////////////////////////////////////////////
  //ROADS
  // https://data.fs.usda.gov/geodata/edw/datasets.php?xmlKeyword
  //////////////////////////////////////////////////
  var all_roads = 
    ee.FeatureCollection([
      ee.FeatureCollection("projects/forestmgmtconstraint/assets/RoadCore_FS") // nfs_roads
      , ee.FeatureCollection("projects/forestmgmtconstraint/assets/TrailNFS_Publish") // nfs_trails
      , ee.FeatureCollection("projects/forestmgmtconstraint/assets/Road_MVUM") // mvum_roads
      , ee.FeatureCollection("projects/forestmgmtconstraint/assets/Trail_MVUM") // mvum_trails
      , ee.FeatureCollection('TIGER/2016/Roads') // TIGER: US Census Roads
    ])
    .flatten()
  ;
  //////////////////////////////////////////////////
  //USFWS PROTECTED SPECIES
  // https://ecos.fws.gov/ecp/report/table/critical-habitat.html
  //////////////////////////////////////////////////
  // lines are complex and make this real slow....should be buffered in riparian anyway 
  // ...but might as well upload simplified line polys with buffer
  // var usfws_lines = ee.FeatureCollection("projects/forestmgmtconstraint/assets/CRITHAB_LINE");
  var usfws_poly = ee.FeatureCollection("projects/forestmgmtconstraint/assets/CRITHAB_POLY");
  //////////////////////////////////////////////////
  // NATIONAL HYDROGRAPHY DATASET (NHD)
  //////////////////////////////////////////////////
  // var nhd_flowline = ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CO/NHDFlowline");
  // var nhd_waterbody = ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CO/NHDWaterbody");
  // combine all features
  var nhd_water = 
    ee.FeatureCollection([
      // nhd_flowline
      ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AL/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AK/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AZ/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AR/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CO/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CT/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_DE/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_FL/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_GA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_HI/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ID/NHDFlowline_1")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IL/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IN/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_KS/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_KY/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_LA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ME/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MD/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MI/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MN/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MS/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MO/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MT/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NE/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NV/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NH/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NJ/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NM/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NY/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NC/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ND/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OH/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OK/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OR/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_PA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_RI/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_SC/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_SD/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_TN/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_TX/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_UT/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_VT/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_VA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WA/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WV/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WI/NHDFlowline")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WY/NHDFlowline")
      // nhd_waterbody
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AL/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AK/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AZ/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_AR/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CO/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_CT/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_DE/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_FL/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_GA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_HI/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ID/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IL/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IN/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_IA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_KS/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_KY/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_LA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ME/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MD/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MI/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MN/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MS/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MO/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_MT/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NE/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NV/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NH/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NJ/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NM/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NY/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_NC/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_ND/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OH/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OK/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_OR/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_PA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_RI/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_SC/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_SD/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_TN/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_TX/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_UT/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_VT/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_VA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WA/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WV/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WI/NHDWaterbody")
      , ee.FeatureCollection("projects/sat-io/open-datasets/NHD/NHD_WY/NHDWaterbody")

    ])
    .flatten()
  ;
  
////////////////////////////////////////////////////////////////////////////////////////////////////
// DEFINE FUNCTION TO MAP OVER USER-DEFINED FEATURE COLLECTION
////////////////////////////////////////////////////////////////////////////////////////////////////
var constraint_image_fn = function(my_feature){
  //////////////////////////////////////////////////
  // NLCD FOREST COVER
  //////////////////////////////////////////////////
    // filter for selected land cover classes
      // A corresponding list of replacement values
      var toList = ee.List.repeat(ee.Number(1), nlcd_class_list.length);
      // Replace pixel values in the image. If the image is multi-band, only the
      // remapped band will be returned. The returned band name is "remapped".
    // create mask
      var nlcd_mask = nlcd
        .filterBounds(my_feature.geometry())
        .first()
        .remap({
          from: nlcd_class_list,
          to: toList,
          defaultValue: 0,
          bandName: 'landcover'
        })
        .rename('is_nlcd_class_list')
      ;
    // apply mask
      var nlcd_treatable = nlcd_mask
        .updateMask(nlcd_mask.eq(1))
      ;
  //////////////////////////////////////////////////
  // PAD-US DATA
  //////////////////////////////////////////////////
    // filter for gap status
    var padus_unmask = padus
      .filterBounds(my_feature.geometry())
      .map(function(feature){
        return feature.set('GAP_Sts', ee.Number.parse(feature.get('GAP_Sts')));
      })
      .filter(
        ee.Filter.or(
          ee.Filter.inList('GAP_Sts', gap_status_list)
          , ee.Filter.and(
            ee.Filter.eq('GAP_Sts', 3)
            , ee.Filter.eq('Des_Tp', 'IRA')
          )
        )
      )
    ;
    // convert to image instead of unioning features
    var padus_img = padus_unmask
      .select(['GAP_Sts'])
      // convert to image instead of unioning features
      .reduceToImage({
        properties: ['GAP_Sts'],
        reducer: ee.Reducer.min()
      })
      .rename(['padus'])
      .multiply(0)
      .add(ee.Number(1))
    ;
  //////////////////////////////////////////////////
  // SLOPE DATA
  //////////////////////////////////////////////////
    // filter slopes
    var slope_mask = slope
      // .clip(my_feature.geometry())
      .lte(max_slope_pct)
    ;
    // apply mask
    var slope_treatable = slope_mask
      .updateMask(slope_mask.eq(1))
    ;
    // var slope_over_max = slope
    //   .updateMask(
    //     slope.gt(max_slope_pct)
    //   )
    //   .multiply(0)
    //   .add(ee.Number(1))
    // ;
  //////////////////////////////////////////////////
  //ROADS
  //////////////////////////////////////////////////
    // convert roads to image with buffer
    var all_roads_img = all_roads
      .filterBounds(
        my_feature
        .buffer((dist_from_road_feet*2)/3.2808, 100) // this is so that roads outside of bounds are considered
        .geometry()
      )
      .map(function(feature){
        return feature
          .buffer(dist_from_road_feet/3.2808, 100)
          .set('roads', ee.Number(1))
        ;
      })
      .filterBounds(my_feature.geometry())
      // convert to image instead of unioning features
      .reduceToImage({
        properties: ['roads'],
        reducer: ee.Reducer.min()
      })
    ;
  //////////////////////////////////////////////////
  // ADMINISTRATIVE BOUNDARIES:
  //  // 1) USFWS PROTECTED SPECIES (https://ecos.fws.gov/ecp/report/table/critical-habitat.html)
  //  // 2) GAP STATUS 2 (E.G. National Wildlife Refuges, State Parks, The Nature Conservancy Preserves)
  //////////////////////////////////////////////////
    // var usfws_lines_buff = usfws_lines
    //     .filterBounds(
    //       my_feature
    //       .buffer(200/3.2808, 100) // this is so that habitat lines outside of bounds are considered
    //       .geometry()
    //     )
    //     .map(function(feature){
    //       return feature
    //         .buffer(100/3.2808, 100)
    //       ;
    //     })
    //     .filterBounds(my_feature.geometry())
    //   ;
    var admin_bounds_mask = 
      ee.FeatureCollection([
        usfws_poly.filterBounds(my_feature.geometry())
        // , usfws_lines_buff
        // ADD PADUS GAP 2
        , padus
          .filterBounds(my_feature.geometry())
          .map(function(feature){
            return feature.set('GAP_Sts', ee.Number.parse(feature.get('GAP_Sts')));
          })
          .filter(ee.Filter.inList('GAP_Sts', [2]))
      ])
      .flatten()
      .map(function(feature){
          return feature
            .set('admin_bounds', ee.Number(1)) // admin_mask_this works b/c this is 1
          ;
        })
      // convert to image instead of unioning features
      .reduceToImage({
        properties: ['admin_bounds'],
        reducer: ee.Reducer.min()
      })
    ;
    // APPLY FILTER TO INCLUDE ADMIN BOUNDS OR NOT
    var admin_bounds = admin_bounds_mask
      .updateMask(admin_bounds_mask.eq(ee.Number(admin_mask_this)))
    ;
  //////////////////////////////////////////////////
  // NATIONAL HYDROGRAPHY DATASET (NHD)
  //////////////////////////////////////////////////
    // riparian buffer
    var riparian_buffer = nhd_water
      .filterBounds(
        my_feature
        .buffer((riparian_buffer_feet*2)/3.2808, 100) // this is so that riparian outside of bounds are considered
        .geometry()
      )
      .map(function(feature){
        return feature
          .buffer(riparian_buffer_feet/3.2808, 100)
          .set('riparian', ee.Number(1))
        ;
      })
      .filterBounds(my_feature.geometry())
      // convert to image instead of unioning features
      .reduceToImage({
        properties: ['riparian'],
        reducer: ee.Reducer.min()
      })
    ;
  //////////////////////////////////////////////////
  //DEFINE TREATABLE FOREST
  //////////////////////////////////////////////////
  var rmn_area_protected = nlcd_treatable
    .updateMask(padus_img.unmask().not())
  ;
  var rmn_area_slope = rmn_area_protected
    .updateMask(slope_treatable)
  ;
  var rmn_area_roads = rmn_area_slope
    .updateMask(all_roads_img)
  ;
  var rmn_area_riparian = rmn_area_roads
    .updateMask(riparian_buffer.unmask().not())
  ;
  var rmn_area_administrative = rmn_area_riparian
    .updateMask(admin_bounds.unmask().not())
  ;

  // treatable
  var is_treatable = rmn_area_administrative.rename(['is_treatable']);

  // //////////////////////////////////////////////////
  // //RETURN IMAGE COLLECTION
  // //////////////////////////////////////////////////
  // // return area_classified;
  // // return new_feature;
  return is_treatable.unmask().int8() // all pixels : 0/1 treatable after all constraints considered
      .addBands(nlcd_mask.int8()) // all nlcd pixels in feature : 0/1 selected land classes
      .addBands(padus_img.unmask().int8()) // protected areas : 0/1 
      .addBands(slope_mask.not().int8()) // steep slopes : 0/1 
      .addBands(all_roads_img.unmask().not().int8()) // roads are distant : 0/1 
      .addBands(riparian_buffer.unmask().not().not().int8()) // riparian buffer : 0/1 
      .addBands(admin_bounds.unmask().not().not().int8()) // administrative boundaries : 0/1 
      // needed for constraint_stats_fn
      .addBands(nlcd_treatable.int8()) // only selected land classes
      .addBands(rmn_area_protected.int8()) // only selected land classes with protected removed
      .addBands(rmn_area_slope.int8()) // only selected land classes with protected & slope removed
      .addBands(rmn_area_roads.int8()) // only selected land classes with protected, slope, & dist road removed
      .addBands(rmn_area_riparian.int8()) // "..."
      .addBands(rmn_area_administrative.int8()) // "..."
    .rename([
      'is_treatable'
      , 'is_selected_nlcd'
      , 'is_protected'
      , 'is_steep_slopes'
      , 'is_roads_distant'
      , 'is_riparian_buffer'
      , 'is_administrative'
      // needed for constraint_stats_fn
      , 'nlcd_treatable'
      , 'rmn_area_protected'
      , 'rmn_area_slope'
      , 'rmn_area_roads'
      , 'rmn_area_riparian'
      , 'rmn_area_administrative'
    ])
  ;
};
//////////////////////////////////////////////////////////////////////////////
// call constraint function to map over features
// ... returns image collection
//////////////////////////////////////////////////////////////////////////////
var all_classified_img_coll = ee.ImageCollection(
  my_feature_collection.map(constraint_image_fn)
);
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// STATS CALC FN
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
var constraint_stats_fn = function(my_feature) {
  // get id of feature
  var ft_id = my_feature.get('system:index')
  // filter image collection
  var this_image = ee.Image(
    all_classified_img_coll
    .filter(ee.Filter.eq('system:index', ft_id))
    .first()
  );
  // define vars for area calcs
  var nlcd_mask = this_image.select('is_selected_nlcd').rename(['nlcd_mask']);
  var nlcd_treatable = this_image.select('nlcd_treatable');
  var rmn_area_protected = this_image.select('rmn_area_protected');
  var rmn_area_slope = this_image.select('rmn_area_slope');
  var rmn_area_roads = this_image.select('rmn_area_roads');
  var rmn_area_riparian = this_image.select('rmn_area_riparian');
  var rmn_area_administrative = this_image.select('rmn_area_administrative');
  //////////////////////////////////////////////////
  //CALCULATE AREA
  //////////////////////////////////////////////////
    // area of feature
    var feature_area_m2 = my_feature.geometry().area();
    // area of image
    var nlcd_area_m2 = nlcd_mask
      .gte(0)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('nlcd_mask')
    ;
    var covertype_area_m2 = nlcd_treatable
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('nlcd_treatable')
    ;
    var rmn_protected_area_m2 = rmn_area_protected
      .eq(1)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('rmn_area_protected')
    ;
    var rmn_slope_area_m2 = rmn_area_slope
      .eq(1)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('rmn_area_slope')
    ;
    var rmn_roads_area_m2 = rmn_area_roads
      .eq(1)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('rmn_area_roads')
    ;
    var rmn_riparian_area_m2 = rmn_area_riparian
      .eq(1)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('rmn_area_riparian')
    ;
    var rmn_administrative_area_m2 = rmn_area_administrative
      .eq(1)
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('rmn_area_administrative')
    ;
    // PCT REMAIN CALC
    var pct_rmn1_protected = ee.Number(rmn_protected_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn2_slope = ee.Number(rmn_slope_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn3_roads = ee.Number(rmn_roads_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn4_riparian = ee.Number(rmn_riparian_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn5_administrative = ee.Number(rmn_administrative_area_m2).divide(ee.Number(covertype_area_m2));
    // FULL LIST OF STATS
    var statistics = ee.Dictionary({
      'feature_area_m2': feature_area_m2
      , 'nlcd_area_m2': nlcd_area_m2
      , 'covertype_area_m2': covertype_area_m2
      , 'rmn1_protected_area_m2' : rmn_protected_area_m2
      , 'rmn2_slope_area_m2' : rmn_slope_area_m2
      , 'rmn3_roads_area_m2' : rmn_roads_area_m2
      , 'rmn4_riparian_area_m2' : rmn_riparian_area_m2
      , 'rmn5_administrative_area_m2' : rmn_administrative_area_m2
      , 'pct_rmn1_protected' : pct_rmn1_protected
      , 'pct_rmn2_slope' : pct_rmn2_slope
      , 'pct_rmn3_roads' : pct_rmn3_roads
      , 'pct_rmn4_riparian' : pct_rmn4_riparian
      , 'pct_rmn5_administrative' : pct_rmn5_administrative
    });
    // add to feature
    var new_feature = my_feature
      .set('feature_area_m2', feature_area_m2)
      .set('nlcd_area_m2', nlcd_area_m2)
      .set('covertype_area_m2', covertype_area_m2)
      .set('rmn1_protected_area_m2', rmn_protected_area_m2)
      .set('rmn2_slope_area_m2', rmn_slope_area_m2)
      .set('rmn3_roads_area_m2', rmn_roads_area_m2)
      .set('rmn4_riparian_area_m2', rmn_riparian_area_m2)
      .set('rmn5_administrative_area_m2', rmn_administrative_area_m2)
      .set('pct_rmn1_protected', pct_rmn1_protected)
      .set('pct_rmn2_slope', pct_rmn2_slope)
      .set('pct_rmn3_roads', pct_rmn3_roads)
      .set('pct_rmn4_riparian', pct_rmn4_riparian)
      .set('pct_rmn5_administrative', pct_rmn5_administrative)
    ;
  // RETURN
  return new_feature;
};
//////////////////////////////////////////////////////////////////////////////
// call stats function to map over features
// ... returns feature collection
//////////////////////////////////////////////////////////////////////////////
var all_classified_ft_coll = ee.FeatureCollection(
  my_feature_collection.map(constraint_stats_fn)
);
// print(all_classified_ft_coll.first(), 'stats');
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
//EXPORTS
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////
// EXPORT TABLE OF STATS
///////////////////////////
  // null geometry so csv can be exported
  var exprt_ft_coll = all_classified_ft_coll.map(function(ft){
    var nullfeat = ee.Feature(null);
    return nullfeat.copyProperties(ft);
  });
  // export
  Export.table.toDrive({
    collection: exprt_ft_coll,
    folder: 'GEE_output',
    description: my_export_prefix+'_statistics',
    fileFormat: 'CSV'
  });
//////////////////////////////////////
//////////////////////////////////////
//////////////////////////////////////
// export geoTIFF with for loop (client-side)
//////////////////////////////////////
//////////////////////////////////////
//////////////////////////////////////
  var name_column = 'NAME';
  var features_names = my_feature_collection.aggregate_array(name_column);
  features_names.evaluate(function(hey_names){
    // names is a list so you have to iterate over it
    for (var n in hey_names) {
      var nm = hey_names[n];
      var nm_strrep = ee.String(nm).replace(' ', '_', 'g');
      var nm_export = ee.String(my_export_prefix).cat('_').cat(nm_strrep);
      // print(nm_export,'nm_export');
      // filter features with ftr name
      var ftr = ee.Feature(my_feature_collection.filter(ee.Filter.eq(name_column, nm)).first());
      // get feature id
      var ftr_id = ftr.get('system:index');
      // filter image collection
      var this_image = ee.Image(
        all_classified_img_coll
        .filter(ee.Filter.eq('system:index', ftr_id))
        .select([
          'is_treatable'
          , 'is_selected_nlcd'
          , 'is_protected'
          , 'is_steep_slopes'
          , 'is_roads_distant'
          , 'is_riparian_buffer'
          , 'is_administrative'
        ])                         // Good.
        .filterBounds(ftr.geometry())          // Good.
        .first()
      );
      // export ftr
      Export.image.toDrive({
        image: this_image,
        folder: 'GEE_output',
        description: nm_export.getInfo(),
        region:ftr.geometry(),
        scale: 30,
        crs: 'EPSG:5070',
        maxPixels: 1e13
      });
    }
  });
