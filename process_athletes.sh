# node instagram_node_util --customimport nfl_2017_salaries.csv --outputdir datanfl
#node instagram_node_util --accountnames --customimport ./athlete_data/NBA.csv --outputdir datanba
#node instagram_node_util --accountnames --customimport ./athlete_data/MLB.csv --outputdir datamlb
#node instagram_node_util --accountnames --customimport ./athlete_data/MLS.csv --outputdir datamls
#node instagram_node_util --accountnames --customimport ./athlete_data/NHL.csv --outputdir datanhl
#node instagram_node_util --accountnames --customimport ./athlete_data/rugby.csv --outputdir datarugby
# to process:
node instagram_node_util --accountnames --customimport ./athlete_data/tennis_men.csv --outputdir data_tennis_men
node instagram_node_util --accountnames --customimport ./athlete_data/tennis_women.csv --outputdir data_tennis_women
node instagram_node_util --accountnames --customimport ./athlete_data/pga.csv --outputdir data_pga
node instagram_node_util --accountnames --customimport ./athlete_data/fifa.csv --outputdir data_fifa