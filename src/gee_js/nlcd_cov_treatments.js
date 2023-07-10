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
        // ee.FeatureCollection("projects/forestmgmtconstraint/assets/Wildfire_Crisis_Strategy_Landscapes")
        ee.FeatureCollection("projects/forestmgmtconstraint/assets/treatment_in_landscapes")
    ;
    // print(my_feature_collection.aggregate_array('area_nm'), 'FORESTS TO DO' );
    print(my_feature_collection.first(), 'exftr' );
    
  //////////////////////////////////////////////////
  // 2. DEFINE NLCD LANDCOVER CLASSES TO CONSIDER
  // SEE:
  // .. https://www.mrlc.gov/data/legends/national-land-cover-database-class-legend-and-description
  //////////////////////////////////////////////////
    
      var my_export_prefix = 'treatment_in_landscapes';

  //////////////////////////////////////////////////
  // NLCD IMPORT
  //////////////////////////////////////////////////
  var nlcd = ee.ImageCollection("USGS/NLCD_RELEASES/2019_REL/NLCD")
    // The collection contains images for multiple years and regions in the USA.  
    // Filter the collection to the 2019 product.
    .filter(ee.Filter.eq('system:index', '2019'))
    // .filterBounds(
    //   ee.Feature(
    //     my_feature_collection.first()
    //     .geometry()
    //     .buffer(1000, 100)
    //   )
    //   .geometry()
    // )
    // Each product has multiple bands for describing aspects of land cover.
    // Select the land cover band.
    .select('landcover')
  ;
  // print(nlcd.count(),'nlcd.count');
  //////////////////////////////////////////////////
  // NLCD CLASSIFY FOREST
  //////////////////////////////////////////////////
    // filter for selected land cover classes
      // A list of NLCD cover classes
      var nlcd_class_list = [41,42,43];
      // A corresponding list of replacement values
      var toList = ee.List.repeat(ee.Number(1), nlcd_class_list.length);
      // Replace pixel values in the image. If the image is multi-band, only the
      // remapped band will be returned. The returned band name is "remapped".
    // create mask
      var nlcd_mask = nlcd
        // .filterBounds(my_feature.geometry())
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
      var nlcd_forest = nlcd_mask
        .updateMask(nlcd_mask.eq(1))
        .rename('nlcd_forest')
        .select('nlcd_forest')
      ;
print(nlcd_forest,'nlcd_forest');
  //////////////////////////////////////////////////
  // NLCD CLASSIFY SHRUBLAND
  //////////////////////////////////////////////////
    // filter for selected land cover classes
      // A list of NLCD cover classes
      var nlcd_class_list = [51,52];
      // A corresponding list of replacement values
      var toList = ee.List.repeat(ee.Number(1), nlcd_class_list.length);
      // Replace pixel values in the image. If the image is multi-band, only the
      // remapped band will be returned. The returned band name is "remapped".
    // create mask
      var nlcd_mask = nlcd
        // .filterBounds(my_feature.geometry())
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
      var nlcd_shrubland = nlcd_mask
        .updateMask(nlcd_mask.eq(1))
        .rename('nlcd_shrubland')
        .select('nlcd_shrubland')
      ;
    print(nlcd_shrubland,'nlcd_shrubland');
  //////////////////////////////////////////////////
  // NLCD COMBINE
  //////////////////////////////////////////////////
  var nlcd_forest_shrubland = ee.ImageCollection.fromImages([
      nlcd_shrubland
        .add(1)
        .toInt8()
        .rename(['forest_shrubland'])
      , nlcd_forest.toInt8().rename(['forest_shrubland'])
    ])
    .mosaic()
  ;
print(nlcd_forest_shrubland,'nlcd_forest_shrubland');

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
/// mappppppppppp
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
Map.centerObject(my_feature_collection.first().geometry(), 7);
Map.addLayer(nlcd.first(), null, 'Landcover',0);
var treatViz = {min: 1, max: 2, palette: ['forestgreen','tan']};
Map.addLayer(nlcd_forest_shrubland.select('forest_shrubland'), treatViz, 'nlcd_forest_shrubland', 1);
Map.addLayer(nlcd_forest.select('nlcd_forest'), {palette: ['forestgreen']}, 'nlcd_forest',0);
Map.addLayer(nlcd_shrubland.select('nlcd_shrubland'),{palette: ['tan']}, 'nlcd_shrubland',0);

////////////////////////////////////////////////////////////////////////////////////////////////////
// DEFINE FUNCTION TO MAP OVER SUB-WATERSHEDS THAT INTERSECT USER-DEFINED FEATURE COLLECTION
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
// STATS CALC FN
////////////////////////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////////////////////////
var area_stats_fn = function(my_feature) {
  //////////////////////////////////////////////////
  //CALCULATE AREA
  //////////////////////////////////////////////////
    // area of feature
    var feature_area_m2 = my_feature.geometry().area();
    
    var forest_area_m2 = nlcd_forest
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('nlcd_forest')
    ;
    var shrubland_area_m2 = nlcd_shrubland
      .multiply(ee.Image.pixelArea())
      .reduceRegion({
        reducer: ee.Reducer.sum()
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('nlcd_shrubland')
    ;

    // FULL LIST OF STATS
    var statistics = ee.Dictionary({
      'feature_area_m2': feature_area_m2
      , 'forest_area_m2': forest_area_m2
      , 'shrubland_area_m2': shrubland_area_m2
    });
    // add to feature
    // var nullfeat = ee.Feature(null);
    var new_feature = 
      my_feature
      // nullfeat.copyProperties(my_feature)
      .set('feature_area_m2', feature_area_m2)
      .set('forest_area_m2', forest_area_m2)
      .set('shrubland_area_m2', shrubland_area_m2)
    ;
  // RETURN
  return new_feature;
};
//////////////////////////////////////////////////////////////////////////////
// call constraint stats function for huc12 that intersect user defined features
//////////////////////////////////////////////////////////////////////////////
var all_classified_ft_coll = ee.FeatureCollection(
  my_feature_collection.map(area_stats_fn)
);
print(all_classified_ft_coll.first(), 'stats');
////////////////////////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////////////////////////
//EXPORTS
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
