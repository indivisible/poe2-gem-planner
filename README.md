# Path of Exile 2 gem planner

Check out the [online version](https://poe2-gems.pages.dev/)!

Building:

 1. clone the repo
 1. if you want to update the gem data:
	 1. create a python virtualenv: `python3 -m venv my-env`
	 1. install the requirements: `./my-env/bin/pip -r requirements.txt`
	 1. download the latest gem data: `wget  -Opoe2db_gem.html  'https://poe2db.tw/us/Gem'`
	 1. generate the new json: `./my-env/bin/python3 parse_gems.py`
1. install JS deps: `npm i -D`
1. run in dev mode: `npm run dev`
1. ...or build a release: `npm run build`
