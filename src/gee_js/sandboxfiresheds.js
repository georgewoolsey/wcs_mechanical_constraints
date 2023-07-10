////////////////////////////////////////////////////////////////////////////////////////////////////
// BEGIN: USER-DEFINED PARAMETERS AND DATA
////////////////////////////////////////////////////////////////////////////////////////////////////
  //////////////////////////////////////////////////
  // 1. DEFINE DATA TO CALC CONSTRAINTS IN BOUNDS
  // CAN USE A GEE DATA SOURCE
  // .. OR UPLOAD CUSTOM DATA SOURCE:
  // ... https://developers.google.com/earth-engine/guides/table_upload
  //////////////////////////////////////////////////
    var ft_list = ee.List([
      // 'Arapaho and Roosevelt National Forests'
      // , 'Grand Mesa, Uncompahgre and Gunnison National Forests'
      // , 'Pike and San Isabel National Forests'
      // , 'Rio Grande National Forest'
      // , 'San Juan National Forest'
      // , 'White River National Forest'
      // '02','03'
      'Montana','Utah','New Mexico','Nevada'
    ]);
    var my_feature_collection = 
      ///////////////// states
        // ee.FeatureCollection("TIGER/2018/States")
        //   .filter(ee.Filter.inList('STUSPS', ft_list))
      ///////////////// usfs forests
        // ee.FeatureCollection("users/GeorgeWoolsey/L48_USFS_NatlForests")
        //   // .filter(ee.Filter.inList('COMMONNAME', ft_list))
        //   .filter(ee.Filter.inList('REGION', ft_list))
      ///////////////// wildfire priority landscapes
        ee.FeatureCollection("projects/forestmgmtconstraint/assets/Wildfire_Crisis_Strategy_Landscapes")
        .filter(ee.Filter.inList('STATE', ft_list))
    
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
      var max_slope_pct = 35;
    // C) HOW FAR (FEET) FROM RIPARIAN ZONES SHOULD TREATMENT BE CONSTRAINED?
      var riparian_buffer_feet = 100;
    // D) ON WHICH LAND DESIGNATION AREAS IS TREATMENT CONSTRAINED BY GAP STATUS CODE?
      // .. options = 1,2,3,4 alone or in combination
      // see: https://www.usgs.gov/programs/gap-analysis-project/science/pad-us-data-overview
      var gap_status_list = [1];
    // E) USE ADMINISTRATIVE BOUNDARIES?
      // [1] = yes; [0] = no
      var use_admin_yes1_no0 = [1]; 
  //////////////////////////////////////////////////
  // 4. DEFINE MINIMUM PERCENT OF SUB-WATERSHED (fireshed)
  // WITHIN FEATURE TO RETURN CALCUALTION FOR
  //////////////////////////////////////////////////
    // E.G. 0.25 RETURNS ONLY SUB-WATERSHEDS THAT HAVE AT LEAST 25% OF AREA WITHIN THE PRIMARY FEATURE
    // SET TO 0 TO RETURN ALL SUB-WATERSHEDS THAT INTERSECT PRIMARY FEATURE
    var minimum_pct_fireshed_area_within = 0.0;
  //////////////////////////////////////////////////
  // 5. NAME EXPORT FILES PREFIX
  //////////////////////////////////////////////////
    var my_export_prefix = 'wfpriority_fireshed_sc1_mtutnmnv';
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
  // Fireshed registry project area 
  //////////////////////////////////////////////////
  var fireshed = ee.FeatureCollection("projects/forestmgmtconstraint/assets/fireshed_registry_project_area")
    .filterBounds(my_feature_collection)
    .map(function(my_feature){
      var pa_area_m2 = ee.Number(my_feature.geometry().area());
      return my_feature.set('pa_area_m2', pa_area_m2);
    })
  ;
  print(fireshed.size(),'fireshed.size');
  //////////////////////////////////////////////////
  // Fireshed registry project area  intersection for export only (no constraint calc)
  // intersect fireshed with user defined feature collection to return only features with minimum pct within
  //////////////////////////////////////////////////
  var fireshed_my_feature_collection = my_feature_collection.map(function(big_feature){
    // var big_feature = ee.Feature(big_feature);
    var fireshed_intersection = fireshed
      .map(function(small_feature){
        var ft_intrsct = small_feature.intersection({'right': big_feature}); // , 'maxError': 1
        var pa_intrsct_area_m2 = ee.Number(ft_intrsct.geometry().area());
        var pa_area_m2 = ee.Number(small_feature.get('pa_area_m2'));
        return ft_intrsct
          .set({
            'pa_intrsct_area_m2': pa_intrsct_area_m2
            , 'pct_pa_intrsct': pa_intrsct_area_m2.divide(pa_area_m2)
          })
          .select(['pa_id','pa_intrsct_area_m2','pct_pa_intrsct','pa_area_m2'])
          .copyProperties(big_feature)
        ;
      }, true) // true on map returns non-null features
      .filter(ee.Filter.gte('pct_pa_intrsct', ee.Number(minimum_pct_fireshed_area_within)))
    ;
    return fireshed_intersection;
  }).flatten();
  // null geometry
  var fireshed_my_feature_collection = fireshed_my_feature_collection.map(function(ft){
    var nullfeat = ee.Feature(null);
    return nullfeat.copyProperties(ft);
  });
  // print(fireshed_my_feature_collection.first(),'fireshed_my_feature_collection');
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
  // print(nlcd.count(),'nlcd.count');
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
  // print(padus.size(),'padus.size');
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
  // print(all_roads.size(),'all_roads.size');
  //////////////////////////////////////////////////
  //USFWS PROTECTED SPECIES
  // https://ecos.fws.gov/ecp/report/table/critical-habitat.html
  //////////////////////////////////////////////////
  // lines are complex and make this real slow....should be buffered in riparian anyway 
  // ...but might as well upload simplified line polys with buffer
  // var usfws_lines = ee.FeatureCollection("projects/forestmgmtconstraint/assets/CRITHAB_LINE");
  var usfws_poly = ee.FeatureCollection("projects/forestmgmtconstraint/assets/CRITHAB_POLY");
  // print(usfws_poly.size(), 'usfws_poly.size');
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
////////////////////////////////////////////////////////////////////////////////////////////////////
// DEFINE FUNCTION TO MAP OVER SUB-WATERSHEDS THAT INTERSECT USER-DEFINED FEATURE COLLECTION
////////////////////////////////////////////////////////////////////////////////////////////////////
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
  var rmn_area_administrative = rmn_area_slope
    .updateMask(admin_bounds.unmask().not())
  ;
  var rmn_area_riparian = rmn_area_administrative
    .updateMask(riparian_buffer.unmask().not())
  ;
  var rmn_area_roads = rmn_area_riparian
    .updateMask(all_roads_img)
  ;

  // FINAL IS TREATABLE
  var istreatable = rmn_area_roads.rename(['istreatable']);
  // COMBINE TREATABLE WITH NON-TREATABLE
  var area_classified = ee.ImageCollection.fromImages([
      nlcd_treatable
        .updateMask(istreatable.unmask().not())
        .subtract(1)
        .toInt8()
        .rename(['istreatable'])
      , istreatable.toInt8().rename(['istreatable'])
    ])
    .mosaic()
  ;
  //////////////////////////////////////////////////
  //RETURN IMAGE COLLECTION
  //////////////////////////////////////////////////
  return area_classified
      .addBands(nlcd_mask) // all nlcd pixels in feature : 0/1 selected land classes
      .addBands(nlcd_treatable) // only selected land classes
      .addBands(rmn_area_protected) // only selected land classes with protected removed
      .addBands(rmn_area_slope) // only selected land classes with protected & slope removed
      .addBands(rmn_area_administrative) // only selected land classes with protected, slope, & admin removed
      .addBands(rmn_area_riparian) // "..."
      .addBands(rmn_area_roads) // "..."
    
    .rename([
      'area_classified'
      , 'nlcd_mask'
      , 'nlcd_treatable'
      , 'rmn_area_protected'
      , 'rmn_area_slope'
      , 'rmn_area_administrative'
      , 'rmn_area_riparian'
      , 'rmn_area_roads'
    ])
  ;
};
//////////////////////////////////////////////////////////////////////////////
// call constraint function for fireshed that intersect user defined features
//////////////////////////////////////////////////////////////////////////////
  var all_classified_img_coll = ee.ImageCollection(
    fireshed.map(constraint_image_fn)
  );
  // print(all_classified_img_coll.count(),'all_classified_img_coll.count');
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// STATS CALC FN
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
var constraint_stats_fn = function(my_feature) {
  // get id of feature
  var ft_id = ee.Feature(my_feature).id();
  // filter image collection
  var this_image = ee.Image(
    all_classified_img_coll
    .filter(ee.Filter.eq('system:index', ft_id))
    .first()
  );
  // define vars for area calcs
  var nlcd_mask = this_image.select('nlcd_mask');
  var nlcd_treatable = this_image.select('nlcd_treatable');
  var rmn_area_protected = this_image.select('rmn_area_protected');
  var rmn_area_slope = this_image.select('rmn_area_slope');
  var rmn_area_administrative = this_image.select('rmn_area_administrative');
  var rmn_area_riparian = this_image.select('rmn_area_riparian');
  var rmn_area_roads = this_image.select('rmn_area_roads');
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
    // PCT REMAIN CALC
    var pct_rmn1_protected = ee.Number(rmn_protected_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn2_slope = ee.Number(rmn_slope_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn3_administrative = ee.Number(rmn_administrative_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn4_riparian = ee.Number(rmn_riparian_area_m2).divide(ee.Number(covertype_area_m2));
    var pct_rmn5_roads = ee.Number(rmn_roads_area_m2).divide(ee.Number(covertype_area_m2));
    // FULL LIST OF STATS
    var statistics = ee.Dictionary({
      'feature_area_m2': feature_area_m2
      , 'nlcd_area_m2': nlcd_area_m2
      , 'covertype_area_m2': covertype_area_m2
      , 'rmn1_protected_area_m2' : rmn_protected_area_m2
      , 'rmn2_slope_area_m2' : rmn_slope_area_m2
      , 'rmn3_administrative_area_m2' : rmn_administrative_area_m2
      , 'rmn4_riparian_area_m2' : rmn_riparian_area_m2
      , 'rmn5_roads_area_m2' : rmn_roads_area_m2
      , 'pct_rmn1_protected' : pct_rmn1_protected
      , 'pct_rmn2_slope' : pct_rmn2_slope
      , 'pct_rmn3_administrative' : pct_rmn3_administrative
      , 'pct_rmn4_riparian' : pct_rmn4_riparian
      , 'pct_rmn5_roads' : pct_rmn5_roads
    });
    // add to feature
    // var nullfeat = ee.Feature(null);
    var new_feature = 
      my_feature
      // nullfeat.copyProperties(my_feature)
      .set('feature_area_m2', feature_area_m2)
      .set('nlcd_area_m2', nlcd_area_m2)
      .set('covertype_area_m2', covertype_area_m2)
      .set('rmn1_protected_area_m2', rmn_protected_area_m2)
      .set('rmn2_slope_area_m2', rmn_slope_area_m2)
      .set('rmn3_administrative_area_m2', rmn_administrative_area_m2)
      .set('rmn4_riparian_area_m2', rmn_riparian_area_m2)
      .set('rmn5_roads_area_m2', rmn_roads_area_m2)
      .set('pct_rmn1_protected', pct_rmn1_protected)
      .set('pct_rmn2_slope', pct_rmn2_slope)
      .set('pct_rmn3_administrative', pct_rmn3_administrative)
      .set('pct_rmn4_riparian', pct_rmn4_riparian)
      .set('pct_rmn5_roads', pct_rmn5_roads)
    ;
  // RETURN
  return new_feature;
};
//////////////////////////////////////////////////////////////////////////////
// call constraint stats function for fireshed that intersect user defined features
//////////////////////////////////////////////////////////////////////////////
var all_classified_ft_coll = ee.FeatureCollection(
  fireshed.map(constraint_stats_fn)
);
// print(all_classified_ft_coll.first(), 'stats');
////////////////////////////////////////////////////////////////////////////////////////////////////
// JOIN WITH INTERSECT SUBWATERSHEDS FOR EXPORT
////////////////////////////////////////////////////////////////////////////////////////////////////
  ////////////////////////////////////////////////////////
  // specify join
  ////////////////////////////////////////////////////////
  // Use an equals filter to specify how the collections match.
  var joinFilter = ee.Filter.equals({
    leftField: 'pa_id',
    rightField: 'pa_id'
  });
  // Define the join.
  var innerJoin = ee.Join.inner('primary', 'secondary');
  // null geometries of classified
  var all_classified_ft_coll_ngeos = all_classified_ft_coll.map(function(ft){
      var nullfeat = ee.Feature(null);
      return nullfeat.copyProperties(ft);
    })
  ;
  // Apply the join.
  var fireshed_my_feature_collection_join = innerJoin
    .apply(fireshed_my_feature_collection, all_classified_ft_coll_ngeos, joinFilter)
    .map(function(pair) {
      var f1 = ee.Feature(pair.get('primary'));
      var f2 = ee.Feature(pair.get('secondary'));
      return f1.set(f2.toDictionary());
    })
  ;

  // Print the result.
  // print(fireshed_my_feature_collection_join.first(), 'fireshed_my_feature_collection_join');

////////////////////////////////////////////////////////////////////////////////////////////////////
//EXPORTS
////////////////////////////////////////////////////////////////////////////////////////////////////
///////////////////////////
// EXPORT TABLE OF STATS
///////////////////////////
// null geometry so csv can be exported
  var exprt_ft_coll = fireshed_my_feature_collection_join.map(function(ft){
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

////////////////////////////////////////
// MAPPING
////////////////////////////////////////
  ////////////////////////////
  // paint empty big polygons
  ////////////////////////////
    // Create an empty image into which to paint the features, cast to byte.
    var empty = ee.Image().byte();

    // Paint all the polygon edges with the same number and width, display.
    var outline = empty.paint({
      featureCollection: my_feature_collection,
      color: 'CNID',
      width: 3
    });
    // set pallette
    var palettes = require('users/gena/packages:palettes');
    var palette = palettes.matplotlib.viridis[7];
    print(palette, 'palette');
    var min_val = my_feature_collection.aggregate_array('CNID').reduce('min');
    var max_val = my_feature_collection.aggregate_array('CNID').reduce('max');
    print(min_val, 'min');
    print(max_val, 'max');
  ////////////////////////////
  // filter fireshed
  ////////////////////////////
  var this_id = my_feature_collection.first().get('ADMINFORES');
  var display_fireshed_intersection = fireshed_my_feature_collection
    .filter(ee.Filter.eq('ADMINFORES',this_id))
  ;
  //////////////////////////////////////////////////////////
  Map.centerObject(my_feature_collection, 10);
  Map.addLayer(fireshed, {color:'gray'}, 'fireshed',0, 0.5);
  Map.addLayer(display_fireshed_intersection, {color:'red'}, 'fireshed_intersection',1, 0.5);
  Map.addLayer(outline, {min:68, max:164, palette:palette}, 'my features', 1);


//////////////////////////////////////////////////
//MAPPING
//////////////////////////////////////////////////
/////////////////////////////////////
// // get id of feature
//   var my_feature = fireshed.filter(ee.Filter.eq('fireshed','140100010303')).first();
//   print(my_feature, 'my_feature');
//   var ft_id = ee.Feature(my_feature).id();
//   print(ft_id,'ft_id');

//   var this_image = ee.Image(
//     all_classified_img_coll
//     .filter(ee.Filter.eq('system:index', ft_id))
//     .first()
//   );
//   print(this_image, 'this_image');


// Map.centerObject(my_feature, 13);
// Map.addLayer(my_feature.geometry(), null, 'FT',1, 0.5);
// var treatViz = {min: 0, max: 1, palette: ['B03A2E','4A235A']};
// Map.addLayer(this_image.select('area_classified').clip(my_feature.geometry()), treatViz, 'area_classified', 0, 0.8);
// Map.addLayer(this_image.select('nlcd_mask').clip(my_feature.geometry()), {min:0,max:1,palette: ['white','forestgreen']}, 'nlcd_mask',0);
// Map.addLayer(this_image.select('rmn_area_protected').clip(my_feature.geometry()),{palette: ['red']}, 'rmn_area_protected',0);
// Map.addLayer(this_image.select('rmn_area_slope').clip(my_feature.geometry()),{palette: ['orangered']}, 'rmn_area_slope',0);
// Map.addLayer(this_image.select('rmn_area_administrative').clip(my_feature.geometry()),{palette: ['orange']}, 'rmn_area_administrative',0);
// Map.addLayer(this_image.select('rmn_area_riparian').clip(my_feature.geometry()),{palette: ['blue']}, 'rmn_area_riparian',0);
// Map.addLayer(this_image.select('rmn_area_roads').clip(my_feature.geometry()),{palette: ['black']}, 'rmn_area_roads',0);



// 1 Columbia River Gorge National Scenic Area         118163.
// 2 Olympic                                           281427.
// 3 Ochoco                                            298496.
// 4 Siuslaw                                           337454.
// 5 Umpqua                                            418434.
// 6 Mt. Hood                                          428054.
// 7 Gifford Pinchot                                   604287.
// 8 Umatilla                                          604846.
// 9 Colville                                          707227.
// 10 Malheur                                           721518.
// 11 Willamette                                        727488.
// 12 Rogue River-Siskiyou                              748549.
// 13 Deschutes                                         755333.
// 14 Mt. Baker-Snoqualmie                              817318.
// 15 Wallowa-Whitman                                  1019570.
// 16 Fremont-Winema                                   1137662.
// 17 Okanogan-Wenatchee                               1556457.

// usfs_fireshed_061
// 'Columbia River Gorge National Scenic Area'

// usfs_fireshed_067
// , 'Fremont-Winema National Forest'

// usfs_fireshed_068
// , 'Wallowa-Whitman National Forest'

// usfs_fireshed_0615
// , 'Malheur National Forest'

// usfs_fireshed_062
// 'Mt. Hood National Forest'

// usfs_fireshed_063
// 'Olympic National Forest'
// , 'Umpqua National Forest'

// usfs_fireshed_064
// , 'Gifford Pinchot National Forest'

// usfs_fireshed_065
// 'Ochoco National Forest'
// , 'Siuslaw National Forest'

// usfs_fireshed_066
// , 'Umatilla National Forest'
// , 'Colville National Forest'
///////////////////////////////////////////////////////////not working
// usfs_fireshed_069
// , 'Okanogan-Wenatchee National Forest'

// usfs_fireshed_0611
// 'Mt. Baker-Snoqualmie National Forest'

// usfs_fireshed_0612
// 'Deschutes National Forest'

// usfs_fireshed_0613
// 'Rogue River-Siskiyou National Forests'

// usfs_fireshed_0614
// 'Willamette National Forest'



//   cnstrnt_class       n avg_pct
//   <ord>           <int>   <dbl>
// 1 low constraint    915   0.365
// 2 med. constraint   607   0.306
// 3 high constraint   969   0.345
