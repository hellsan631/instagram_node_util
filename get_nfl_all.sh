node instagram_node_util --customimport ./athlete_data/nfl_2017_salaries.csv --outputdir ./datanfl/ --write_frequency 50 --accountnames
node --max_old_space_size=6000 instagram_node_util.js -l athlete_data/nfl_2017_salaries.csv -g datanfl/out*_final.csv -t datanfl/outText*_final.csv --outputdir data_nfl_full_2712 --write_frequency 50
