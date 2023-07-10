var ex_polygon = ee.FeatureCollection("users/GeorgeWoolsey/unit_bbox");
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
      'Enchanted Circle'
    ]);
    var my_feature_collection = 
    ///////////////// usfs forests
      // ee.FeatureCollection("users/GeorgeWoolsey/L48_USFS_NatlForests")
      //   .filter(ee.Filter.inList('COMMONNAME', ft_list))
      //   // .filter(ee.Filter.inList('REGION', ft_list))
    ///////////////// wildfire priority landscapes
      ee.FeatureCollection("projects/forestmgmtconstraint/assets/Wildfire_Crisis_Strategy_Landscapes")
      // .filter(ee.Filter.inList('NAME', ft_list))
    ;
  print(my_feature_collection.aggregate_array('NAME'), 'FORESTS TO DO' );
  //////////////////////////////////////////////////
  // NAME EXPORT FILES PREFIX
  //////////////////////////////////////////////////
    var my_export_prefix = 'wfpriority';
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
    .filterBounds(my_feature_collection)
    .first()
  ;
  // print(nlcd,'nlcd');
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
// FUNCTION TO CALCULATE AREA BY CLASS
////////////////////////////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////////
var nlcd_area_fn = function(my_feature){
  // null geometry
    var ft_cols = ee.Feature(null)
      .copyProperties(my_feature)
    ;
    // print(ft_cols,'ft_cols');
  // sum by group...returns list
    var sum_by_grp_list = ee.Image.pixelArea().addBands(nlcd)
      .reduceRegion({
        reducer: ee.Reducer.sum().group({
          groupField: 1
          , groupName: 'nlcd_class'
        })
        , geometry: my_feature.geometry()
        , scale: 30
        , maxPixels: 1e12
      })
      .get('groups')
    ;
    // print(sum_by_grp_list,'sum_by_grp_list');
  // convert list to dictionary
    var class_list = ee.List(sum_by_grp_list).map(function(pair){
      var cl = ee.Dictionary(pair).get('nlcd_class');
      var cl_str = ee.String('area_m2_nlcd_cl_').cat(ee.String(cl));
      return cl_str;
    });
    var area_list = ee.List(sum_by_grp_list).map(function(pair){
      var ar = ee.Dictionary(pair).get('sum');
      return ar;
    });
    var area_dict = ee.Dictionary.fromLists(class_list, area_list);
    // print(area_dict,'area_dict');
  // ADD MISSING NLCD CLASSES
    var nlcd_zero_dict = ee.Dictionary({
      area_m2_nlcd_cl_11: 0
      ,area_m2_nlcd_cl_12: 0
      ,area_m2_nlcd_cl_21: 0
      ,area_m2_nlcd_cl_22: 0
      ,area_m2_nlcd_cl_23: 0
      ,area_m2_nlcd_cl_24: 0
      ,area_m2_nlcd_cl_31: 0
      ,area_m2_nlcd_cl_41: 0
      ,area_m2_nlcd_cl_42: 0
      ,area_m2_nlcd_cl_43: 0
      ,area_m2_nlcd_cl_51: 0
      ,area_m2_nlcd_cl_52: 0
      ,area_m2_nlcd_cl_71: 0
      ,area_m2_nlcd_cl_72: 0
      ,area_m2_nlcd_cl_73: 0
      ,area_m2_nlcd_cl_74: 0
      ,area_m2_nlcd_cl_81: 0
      ,area_m2_nlcd_cl_82: 0
      ,area_m2_nlcd_cl_90: 0
      ,area_m2_nlcd_cl_95: 0
    });
    // Combines two dictionaries. In the case of duplicate names:
      // the output will contain the value of the second dictionary unless overwrite is false.
    var full_area_dict = nlcd_zero_dict.combine(area_dict, true);
    // print(full_area_dict,'full_area_dict');
  // add dictionary to feature data 
    var this_data = ft_cols.set(full_area_dict);
    // print(this_data);
  // return
  return this_data;
};
// apply function
var my_collection_nlcd_area = my_feature_collection.map(nlcd_area_fn);
//////////////////////////////////////////////////
//EXPORTS
//////////////////////////////////////////////////
  // export
  Export.table.toDrive({
    collection: my_collection_nlcd_area,
    folder: 'GEE_output',
    description: my_export_prefix+'_nlcd_area',
    fileFormat: 'CSV'
  });
