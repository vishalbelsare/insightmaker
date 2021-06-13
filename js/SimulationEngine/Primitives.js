"use strict";
/*

Copyright 2010-2020 Scott Fortmann-Roe. All rights reserved.

This file may distributed and/or modified under the
terms of the Insight Maker Public License (https://InsightMaker.com/impl).

*/


class Primitive {
	constructor() {
		this.id = null;
		this.agentId = null;
		this.index = null;
		this.instanceId = null;

		this.container = null;

		this.dna = null;

		this.equation = null;

		this.cachedValue = undefined;
		this.pastValues = [];
		this.pastData = new DataBank();

		this.frozen = false;

		this.parent = PrimitiveBase;
	}

	clone() {
		let p = new this.constructorFunction();
		p.dna = this.dna;
		p.container = this.container;
		p.agentId = this.agentId;
		p.index = this.index;
		p.id = this.id;
		p.createIds();
		p.pastValues = this.pastValues.slice(0);

		if (this.dna.slider) {
			if (simulate.sliders[this.dna.id]) {
				simulate.sliders[this.dna.id].push(p);
			} else {
				simulate.sliders[this.dna.id] = [p];
			}

		}

		p.cachedValue = this.cachedValue ? this.cachedValue.fullClone() : this.cachedValue;

		this.innerClone(p);

		return p;
	}

	clearCached() {
		this.cachedValue = undefined;
	}

	storeValue() {
		if (isUndefined(this.cachedValue)) {
			this.value();
		}
		this.pastValues.push(this.cachedValue)
	}

	toNum() {
		return this.value();
	}

	calculateValue() {
		throw "MSG: " + getText("[%s] does not have a value and can not be used as a value in an equation.", this.dna.name);
	}

	createIds() {
		this.instanceId = simulate.getID(this.agentId + "-" + this.index);
	}

	getPastValues(length) {
		let items = this.pastValues.slice();

		/* Add current value to array if needed */
		let bins = Math.ceil(div(simulate.time(), this.dna.solver.userTimeStep).value) + 1;
		if (items.length < bins) {
			items.push(this.value());
		}

		let res;
		if (isUndefined(length)) {
			res = items.map(x => x.fullClone());
		} else {
			let bins = Math.ceil(div(length.forceUnits(simulate.timeUnits), this.dna.solver.userTimeStep).value);

			res = [];
			for (let i = Math.max(0, items.length - 1 - bins); i < items.length; i++) {
				res.push(items[i].fullClone());
			}
		}

		return res;
	}

	pastValue(delay, defaultValue) {
		let periods;

		if (this.pastValues.length - 1 < Math.round((simulate.time().value - simulate.timeStart.value) / this.dna.solver.userTimeStep.value)) {
			periods = div(delay.forceUnits(simulate.timeUnits), this.dna.solver.userTimeStep).value;
		} else {
			periods = div(delay.forceUnits(simulate.timeUnits), this.dna.solver.userTimeStep).value + 1;
		}

		if (periods == 0) {
			return this.value();
		}

		if (Math.ceil(periods) > this.pastValues.length) {
			if (isUndefined(defaultValue)) {
				if (this.pastValues.length > 0) {
					return this.pastValues[0].fullClone();
				} else {
					return this.value();
				}
			} else {
				return defaultValue;
			}
		}

		if (periods == Math.round(periods)) {
			if (periods == 0) {
				return value;
			} else {
				return this.pastValues[this.pastValues.length - periods].fullClone();
			}
		}

		let fraction = periods - Math.floor(periods);
		let entry = Math.floor(periods);
		let first_period, second_period;
		if (entry == 0) {
			first_period = this.value();
		} else {
			first_period = this.pastValues[this.pastValues.length - entry];
		}
		second_period = this.pastValues[this.pastValues.length - 1 - entry];
		return plus(mult(first_period, new Material(1 - fraction)), mult(second_period, new Material(fraction)));
	}

	smoothF(delay, initialV) {
		let a = div(this.dna.solver.userTimeStep, delay.forceUnits(simulate.timeUnits)).value;

		let dat = this.pastData.getSeries("Smooth: " + a + "," + initialV);

		if (dat.length == 0) {
			if (isUndefined(initialV)) {
				dat.push(this.pastValues[0] ? this.pastValues[0] : this.value());
			} else {
				dat.push(initialV);
			}
		}

		let maxInd = Math.floor((simulate.time().value - simulate.timeStart.value) / this.dna.solver.userTimeStep.value);

		for (let i = dat.length - 1; i < maxInd; i++) {
			let m = this.pastValues[i] ? this.pastValues[i] : (this.cachedValue ? this.cachedValue : this.pastValues[i - 1]);
			dat.push(plus(mult(dat[i], new Material(1 - a)), mult(new Material(a), m)));
		}

		return dat[dat.length - 1].fullClone();
	}

	expDelayF(order, delay, initialV) {
		this.value();

		let a = div(this.dna.solver.userTimeStep, delay.forceUnits(simulate.timeUnits)).value * order;

		let dat = this.pastData.getSeries("ExpDelay: " + order + "," + delay.value + "," + initialV);

		if (dat.length == 0) {
			if (isUndefined(initialV)) {
				dat.push(new ExpGroup(order, a, this.pastValues[0] ? this.pastValues[0] : this.value()));
			} else {
				let exIV = new ExpGroup(order, a, initialV);
				dat.push(exIV.moveForward(this.pastValues[0] ? this.pastValues[0] : this.value()));
			}
		}

		for (let i = dat.length; i < this.pastValues.length; i++) {
			dat.push(dat[i - 1].moveForward(this.pastValues[i]));
		}

		return dat[dat.length - 1].out.fullClone();
	}

	testUnits(m, ignoreFlow) {
		if (m instanceof Vector) {
			m.recurseApply(x => {
				this.testUnits(x, ignoreFlow);
				return x;
			});
			return;
		}

		if ((!this.dna.units) && m.units) {
			error(getText("Wrong units generated for %s. Expected no units and got %s. Either specify units for the primitive or adjust the equation.", "<i>" + clean(this.dna.name) + "</i>", "<i>" + clean(m.units.toString()) + "</i>"), this, true);
		} else if (this.dna.units !== m.units) {
			let scale = convertUnits(m.units, this.dna.units, true);//XXX fixme
			if (scale == 0) {
				if (isLocal()) {
					console.log(m.units);
					console.log(this.dna.units);
				}
				error(getText("Wrong units generated for %s. Expected %s, and got %s.", "<i>" + clean(this.dna.name) + "</i>", "<i>" + clean(this.dna.units.toString()) + "</i>", "<i>" + clean(m.units.toString()) + "</i>"), this, true);
				return
			} else {
				m.value = m.value * scale;
				m.units = this.dna.units;
			}
		}
		if ((this instanceof Flow) && (ignoreFlow != true) && this.dna.flowUnitless) {
			let x = mult(m, new Material(1, simulate.timeUnits));
			m.value = x.value;
			m.units = x.units;
		}
	}

	setValue() {
		throw "MSG: " + getText("You cannot set the value for that primitive.");
	}

	printPastValues() {
		console.log(this.pastValues.map(x => x.value))
	}

	value() {
		if (isUndefined(this.cachedValue) && this.frozen && this.pastValues.length > 0) {
			let v = this.pastValues[this.pastValues.length - 1];
			if (v.fullClone) {
				this.cachedValue = v.fullClone();
			} else {
				this.cachedValue = v;
			}
		}

		if (isUndefined(this.cachedValue)) {


			if (simulate.valuedPrimitives.indexOf(this) > -1) {
				throw "MSG: " + getText("Circular equation loop identified including the primitives: %s", simulate.valuedPrimitives.slice(simulate.valuedPrimitives.indexOf(this)).map(x => x.dna.name).join(", "));
			}
			simulate.valuedPrimitives.push(this);

			let x;
			try {
				x = this.calculateValue().toNum();
				if ((x instanceof Material) && !isFinite(x.value)) {
					if (isLocal()) {
						console.log(x)
					}
					if (this instanceof Stock) {
						throw ("MSG: " + getText("The stock has become infinite in size. Check the flows into it for rapid growth."));
					} else {
						throw ("MSG: " + getText("The result of this calculation is not a number (are you dividing by 0?)."));
					}
				}
			} catch (err) {
				if (!err.substr) {
					throw err; //it's already an object, let's kick it up the chain
				}
				if (isLocal()) {
					console.log(err);
				}
				if (err.substr(0, 4) == "MSG:") {
					error(err.substr(4, err.length), this, true);
				} else {
					error(err, this, true);
				}
			}
			if (!(this instanceof State)) {
				this.testUnits(x);
				this.testConstraints(x);
			}

			this.cachedValue = x;
		}


		if (this.cachedValue.fullClone) {
			return this.cachedValue.fullClone();
		} else {
			return this.cachedValue;
		}
	}

	testConstraints(x) {
		let test = (x) => {
			if ((this.dna.maxConstraintType == 1 && x.value > this.dna.maxConstraint) || (this.dna.maxConstraintType == 2 && x.value >= this.dna.maxConstraint)) {
				constraintAlert(this, "max", x);
			}
			if ((this.dna.minConstraintType == 1 && x.value < this.dna.minConstraint) || (this.dna.minConstraintType == 2 && x.value <= this.dna.minConstraint)) {
				constraintAlert(this, "min", x);
			}
			return x;
		}
		if (x instanceof Vector) {
			x.recurseApply(test);
		} else {
			test(x);
		}
	}

	setEquation(tree, neighborhood) {
		if (this instanceof Flow || this instanceof Transition) {
			if (this.omega !== null) {
				neighborhood.omega = this.omega;
			}
			if (this.alpha !== null) {
				neighborhood.alpha = this.alpha;
			}
		}

		try {
			this.equation = trimTree(tree, neighborhood);
		} catch (err) {
			if (isLocal()) {
				console.log(err);
			}
			error(err.substr(4, err.length), this, true);
		}
	}
}

class Placeholder extends Primitive {
	constructor(dna, primitive) {
		super();
		this.dna = dna;
		this.id = dna.id;
		this.primitive = primitive;
	}
	calculateValue() {
		error(getText("[%s] is a placeholder and cannot be used as a direct value in equations.", clean(this.dna.name)), this.primitive, true);
	}
}

class State extends Primitive {
	constructor() {
		super();
		this.active = null;
		this.downStreamTransitions = [];
		this.constructorFunction = State;
	}
	innerClone(p) {
		p.setValue(this.active);

	}
	setValue(value) {
		this.setActive(trueValue(value));
		this.cachedValue = undefined;
		simulate.valuedPrimitives = [];
		this.value();
		if (this.agentId) {
			this.container.updateStates();
		}
	}
	calculateValue() {
		if (this.active === null) {
			this.setInitialActive(true);
		}

		if (this.active) {
			return new Material(1);
		} else {
			return new Material(0);
		}

	}
	setInitialActive(suppress) {
		let init;

		try {
			init = evaluateTree(this.equation, globalVars(this)).toNum();
		} catch (err) {
			if (!err.substr) {
				throw err; //it's already an object, let's kick it up the chain
			}
			if (isLocal()) {
				console.log(err);
			}
			if (err.substr(0, 4) == "MSG:") {
				error(err.substr(4, err.length), this, true);
			} else {
				error(err, this, true);
			}
		}

		this.setActive(trueValue(init), suppress);
		if (this.agentId) {
			this.container.updateStates();
		}

	}
	setActive(active, suppress) {
		this.active = active;

		if ((!active) || this.dna.residency === null) {
			if (!suppress) {
				if (active) {
					if (!simulate.transitionPrimitives) {
						simulate.transitionPrimitives = [];
					}

					if (simulate.transitionPrimitives.length > 1200 && simulate.transitionPrimitives.indexOf(this) > -1) {
						throw "MSG: " + getText("Circular fully active transition loop identified including the states: %s", simulate.transitionPrimitives.slice(0, 5).map(x => x.dna.name).join(", "));
					}
					simulate.transitionPrimitives.push(this);
				}

				for (let i = 0; i < this.downStreamTransitions.length; i++) {
					scheduleTrigger.call(this.downStreamTransitions[i]);
				}

				if (active) {
					simulate.transitionPrimitives = [];
				}

			}
		} else {
			let me = this;
			simulate.tasks.add(new Task({
				name: "State Residency",
				time: plus(simulate.time(), this.dna.residency),
				priority: 5,
				expires: 1,
				action: function () {
					for (let i = 0; i < me.downStreamTransitions.length; i++) {
						scheduleTrigger.call(me.downStreamTransitions[i]);
					}
				}
			}));
		}

	}
	getActive() {
		if (this.active === null) {
			this.setInitialActive(true);
		}
		return this.active;
	}
}


class Transition extends Primitive {
	constructor() {
		super();
		this.alpha = null;
		this.omega = null;
		this.scheduledTrigger = null;
		this.constructorFunction = Transition;
	}
	innerClone(p) { }
	setEnds(alpha, omega) {
		this.alpha = alpha;
		this.omega = omega;
		if (alpha) {
			alpha.downStreamTransitions.push(this);
		}
	}
	canTrigger() {
		return (!this.alpha) || (this.alpha && this.alpha.getActive()) || (this.dna.repeat && this.dna.trigger != "Condition");
	}
	trigger() {

		this.scheduledTrigger = null;

		if (this.frozen) {
			return;
		}

		if (this.alpha) {
			this.alpha.setActive(false);
		}
		if (this.omega) {
			this.omega.setActive(true);
		}
		if (this.agentId) {
			this.container.updateStates();
		}
		if (this.dna.repeat && this.dna.trigger != "Condition") {
			scheduleTrigger.call(this);
		}
	}
}

function scheduleTrigger() {
	updateTrigger.call(this, true);

}

function clearTrigger(force) {
	if (this.scheduledTrigger && (force || (!this.dna.repeat))) {
		this.scheduledTrigger.kill();
		this.scheduledTrigger = null;
	}
}

function updateTrigger(clear) {
	if (clear) {
		clearTrigger.call(this);
	}


	if (this.canTrigger()) {
		let v;
		try {
			v = evaluateTree(this.equation, globalVars(this)).toNum();
		} catch (err) {
			if (!err.substr) {
				throw err; //it's already an object, let's kick it up the chain
			}
			if (isLocal()) {
				console.log(err);
			}
			if (err.substr(0, 4) == "MSG:") {
				error(err.substr(4, err.length), this, true);
			} else {
				error(err, this, true);
			}
		}

		if (this.dna.trigger == "Condition") {
			if (trueValue(v)) {
				this.trigger();
			}
		} else {
			if (!(v instanceof Material)) {
				error(getText("The value of this trigger must evaluate to a number."), this, true);
			}

			let t;

			if (this.dna.trigger == "Timeout") {

				if (!v.units) {
					v.units = simulate.timeUnits;
				}

				if (this.scheduledTrigger && eq(v, this.scheduledTrigger.data.value)) {
					return;
				}
				if (this.dna.repeat && v.value == 0) {
					error(getText("A trigger Timeout of 0 with 'Repeat' set to true results in an infinite loop."), this, true);
				}

				t = v;

			} else if (this.dna.trigger == "Probability") {

				if (v.units) {
					error(getText("The probability for the trigger had units of %s. Probabilities must be unitless.", this.value().units.toString()), this, true);
				}
				v = v.value
				if (this.scheduledTrigger && eq(v, this.scheduledTrigger.data.value)) {
					return;
				}

				if (v == 1) {
					if (this.dna.repeat) {
						error(getText("A trigger probability of 1 with 'Repeat' as true results in an infinite loop."), this, true);
					}
					t = new Material(0, simulate.timeUnits);
				} else if (v > 1) {
					error(getText("The probability for the trigger must be less than or equal to 1."), this, true);
				} else if (v < 0) {
					error(getText("The probability for the trigger must be greater than or equal to 0."), this, true);
				} else if (v == 0) {
					if (!this.scheduledTrigger) {
						return;
					}
				} else {
					let l = -Math.log(1 - v);
					t = new Material(RandExp(l), simulate.timeUnits);
				}

			}

			let start = simulate.time()

			if (this.scheduledTrigger) {

				this.scheduledTrigger.kill();
				if (this.dna.trigger == "Timeout") {
					if (lessThanEq(t, minus(simulate.time(), this.scheduledTrigger.data.start))) {
						this.scheduledTrigger = null;
						this.trigger();
						return;
					} else {
						start = this.scheduledTrigger.data.start;
						t = minus(t, minus(simulate.time(), start));
						this.scheduledTrigger = null;
					}
				} else if (this.dna.trigger == "Probability") {
					if (v == 0) {
						this.scheduledTrigger = null;
						return;
					}
					t = minus(this.scheduledTrigger.time, simulate.time());

					let l0 = -Math.log(1 - this.scheduledTrigger.data.value);
					let l = -Math.log(1 - v);

					t = mult(t, new Material(l0 / l));

					start = this.scheduledTrigger.data.start;

					this.scheduledTrigger = null;
				}
			}
			t = plus(t, simulate.time());

			let me = this;
			this.scheduledTrigger = new Task({
				name: "Trigger",
				time: t,
				priority: 5,
				expires: 1,
				action: function () {
					me.trigger();
				},
				data: { start: start, value: v }
			})
			simulate.tasks.add(this.scheduledTrigger);
		}
	}
}

class Action extends Primitive {
	constructor() {
		super();
		this.action = null;
		this.scheduledTrigger = null;
		this.block = false;
		this.constructorFunction = Action;
	}
	innerClone(p) { }
	canTrigger() {
		return !this.block;
	}
	resetTimer() {
		scheduleTrigger.call(this);
	}
	trigger() {

		this.scheduledTrigger = null;

		if (this.frozen) {
			return;
		}

		try {
			evaluateTree(this.action, globalVars(this));

			if (this.dna.repeat) {
				if (this.dna.trigger !== "Condition") {
					scheduleTrigger.call(this);
				}
			} else {
				this.block = true;
			}
		} catch (err) {
			if (!err.substr) {
				throw err; //it's already an object, let's kick it up the chain
			}
			if (isLocal()) {
				console.log(err);
			}
			if (err.substr(0, 4) == "MSG:") {
				error(err.substr(4, err.length), this, true);
			} else {
				error(err, this, true);
			}
		}
	}
}

class Agents extends Primitive {
	constructor() {
		super();
		this.size = null;
		this.agents = null;
		this.geoWidth = null;
		this.geoHeight = null;
		this.halfWidth = null;
		this.halfHeight = null;
		this.geoDimUnits = null;
		this.geoDimUnitsObject = null;
		this.geoWrap = null;
		this.DNAs = null;
		this.stateIds = [];
		this.constructorFunction = Agents;

		this.vector = new Vector([], [], PrimitiveBase);
	}
	collectData() {
		let x = [];
		for (let i = 0; i < this.agents.length; i++) {
			let agent = this.agents[i];
			x.push({ instanceId: agent.instanceId, connected: agent.connected.map(x => x.instanceId), location: simpleNum(agent.location.clone(), this.geoDimUnitsObject), state: agent.states.length > 0 ? agent.states.slice() : null });
		}
		return x;
	}
	states() {
		return this.stateIds.slice(0);
	}
	toNum() {
		throw ("MSG: " + getText("[%s] is a population of agents and cannot be used as a direct value in equations.", clean(this.dna.name)));
	}
	add(base) {
		this.size = 1 + parseInt(this.size, 10);
		let agent;

		if (base) {
			agent = base.agentClone();
			agent.agentId = this.agentId;
			agent.setIndex(this.size - 1);
			agent.createAgentIds();

			for (let i = 0; i < this.DNAs.length; i++) {
				let x = agent.children[i];
				let dna = this.DNAs[i];

				x.container = agent;

				linkPrimitive(x, dna);

			}

			agent.updateStates();

		} else {
			agent = new Agent();
			agent.container = this;
			agent.children = [];
			agent.childrenId = {};
			agent.agentId = this.agentId;

			for (let i = 0; i < this.DNAs.length; i++) {
				decodeDNA(this.DNAs[i], agent);
			}

			agent.setIndex(this.size - 1);
			agent.createAgentIds();

			for (let i = 0; i < this.DNAs.length; i++) {
				linkPrimitive(agent.children[i], this.DNAs[i]);
			}

			setAgentInitialValues(agent);

			let hood = getPrimitiveNeighborhood(this, this.dna);

			if (this.placement == "Custom Function") {
				hood.self = agent;
				agent.location = simpleUnitsTest(simpleEquation(this.placementFunction, { "-parent": varBank, self: agent }, hood), this.geoDimUnitsObject);
				if (!agent.location.names) {
					agent.location.names = ["x", "y"];
					agent.location.namesLC = ["x", "y"];
				}
			} else {
				agent.location = new Vector([mult(this.geoWidth, new Material(Rand())), mult(this.geoHeight, new Material(Rand()))], ["x", "y"]);
			}
			if (this.network == "Custom Function") {
				let tree = trimTree(createTree(this.networkFunction), hood);
				for (let i = 0; i < this.agents.length; i++) {
					if (agent !== this.agents[i]) {
						if (trueValue(simpleEquation(this.networkFunction, { "-parent": varBank, "a": agent, "b": this.agents[i] }, hood, tree))) {
							agent.connect(this.agents[i]);
						}
					}
				}
			}



		}

		let me = this;
		simulate.tasks.add(new Task({
			priority: 10,
			expires: 1,
			name: "Add Agent",
			time: simulate.time(),
			action: function () {
				me.agents.push(agent);

				for (let i = 0; i < agent.children.length; i++) {
					let x = agent.children[i];

					let dna = me.DNAs[i];

					if ((x instanceof Action) || (x instanceof Transition)) {
						if (dna.trigger != "Condition") {
							scheduleTrigger.call(x);
						}
					}

					if (base) {
						if (x instanceof Action) {
							dna.solver.actions.push(x);
						} else if (x instanceof Transition) {
							dna.solver.transitions.push(x);
						} else if (!(x instanceof Agents)) {
							dna.solver.valued.push(x)
							if (x instanceof Flow) {
								dna.solver.flows.push(x);
							} else if (x instanceof Stock) {
								dna.solver.stocks.push(x);
							} else if (x instanceof State) {
								dna.solver.states.push(x);
							}
						}
					}


				}


			}
		}));

		return agent;
	}
}


class Agent {
	constructor() {
		this.agentId = null;
		this.instanceId = null;
		this.index = null;
		this.children = null;
		this.location = null;
		this.connected = [];
		this.connectedWeights = [];
		this.dead = false;
		this.constructorFunction = Agent;
		this.stateIDs = [];
		this.states = [];

		this.vector = new Vector([], [], AgentBase);
	}
	createIds() {
		// same as Primitive
		this.instanceId = simulate.getID(this.agentId + "-" + this.index);
	}
	toString() {
		return "Agent " + (this.index + 1);
	}
	toNum() {
		return this;
		//throw("MSG: Invalid attempt to use an agent as a valued primitive.");
	}
	updateStates() {
		this.states = [];
		this.stateIDs = [];
		for (let c = 0; c < this.children.length; c++) {
			if (this.children[c].active) {
				this.states.push(this.children[c]);
				this.stateIDs.push(this.children[c].dna.id);
			}
		}
	}
	agentClone() {
		let agent = new Agent();
		agent.dna = this.dna;
		agent.children = [];
		agent.childrenId = {};

		for (let i = 0; i < this.children.length; i++) {
			agent.children.push(this.children[i].clone());
			agent.childrenId[agent.children[i].dna.id] = agent.children[i];
		}

		agent.location = this.location.clone();
		agent.connected = this.connected.slice(0);
		agent.connectedWeights = this.connectedWeights.slice(0);
		agent.container = this.container;


		return agent;
	}
	setIndex(index) {
		this.index = index;
		for (let i = 0; i < this.children.length; i++) {
			this.children[i].index = index;
		}
	}
	createAgentIds() {
		this.createIds();
		for (let i = 0; i < this.children.length; i++) {
			this.children[i].createIds();
		}
	}
	die() {
		while (this.connected.length > 0) {
			this.unconnect(this.connected[0]);
		}

		for (let i = 0; i < this.container.agents.length; i++) {
			if (this.container.agents[i] == this) {
				this.container.agents.splice(i, 1);
				break;
			}
		}

		for (let i = 0; i < this.children.length; i++) {
			let x = this.children[i];
			let solver = x.dna.solver;
			if (x instanceof Action) {
				solver.actions.splice(solver.actions.indexOf(x), 1);
				clearTrigger.call(x, true);
			} else if (x instanceof Transition) {
				solver.transitions.splice(solver.transitions.indexOf(x), 1);
				clearTrigger.call(x, true);
			} else if (!(x instanceof Agents)) {
				solver.valued.splice(solver.valued.indexOf(x), 1);
				if (x instanceof Flow) {
					solver.flows.splice(solver.flows.indexOf(x), 1);
				}
				else if (x instanceof Stock) {
					solver.stocks.splice(solver.stocks.indexOf(x), 1);
				}
				else if (x instanceof State) {
					solver.states.splice(solver.states.indexOf(x), 1);
				}
			}
		}


		this.dead = true;
	}
	connect(x, weight) {
		let w = (weight === undefined) ? new Material(1) : weight;
		if (x !== this) {
			if (this.connected.indexOf(x) == -1) {
				if (x instanceof Agent) {
					this.connected.push(x);
					this.connectedWeights.push(w);
					x.connected.push(this);
					x.connectedWeights.push(w);
				} else {
					throw ("MSG: Only agents may be connected.");
				}
			} else if (weight !== undefined) {
				this.connectedWeights[this.connected.indexOf(x)] = weight;
				x.connectedWeights[x.connected.indexOf(x)] = weight;
			}
		}

	}
	unconnect(x) {
		if (x !== this) {
			let i = this.connected.indexOf(x);
			if (i != -1) {
				this.connected.splice(i, 1);
				this.connectedWeights.splice(i, 1);
				i = x.connected.indexOf(this);
				x.connected.splice(i, 1);
				x.connectedWeights.splice(i, 1);
			}
		}
	}

	connectionWeight(x) {
		if (x !== this) {
			let i = this.connected.indexOf(x);

			if (i != -1) {
				return this.connectedWeights[i].fullClone();
			}
		}
		throw "MSG: Agents are not connected and so do not have a connection weight.";
	}

	setConnectionWeight(x, w) {
		if (x !== this) {
			let i = this.connected.indexOf(x);
			if (i != -1) {
				this.connectedWeights[i] = w.fullClone();
				return;
			}
		}
		throw "MSG: Agents are not connected and so do not have a connection weight.";
	}
}

class Stock extends Primitive {
	constructor() {
		super();
		this.level = null;
		this.constructorFunction = Stock;
		this.delay = undefined;
		this.tasks = [];
		this.initRate = null;
		this.oldLevel = null;
	}

	innerClone(p) {
		p.level = this.level;
		p.oldLevel = this.oldLevel;
		p.tasks = this.tasks;
		p.delay = this.delay;
	}

	setValue(value) {
		this.level = value;
		this.cachedValue = undefined;
		simulate.valuedPrimitives = [];
		this.value();
	}

	print() {
		console.log(this.level.map(x => x.value));
	}

	preserveLevel() {
		for (let i = this.tasks.length - 1; i >= 0; i--) {
			this.tasks[i].data.tentative = false;
		}
		this.oldLevel = this.level;
	}

	restoreLevel() {
		for (let i = this.tasks.length - 1; i >= 0; i--) {
			if (this.tasks[i].data.tentative) {
				this.tasks[i].remove();
				this.tasks.splice(i, 1);
			}
		}
		this.level = this.oldLevel;
	}

	setDelay(delay) {
		delay = delay || this.dna.delay;
		this.delay = delay;
	}

	setInitialValue() {
		let init;

		try {
			init = evaluateTree(this.equation, globalVars(this)).toNum();
		} catch (err) {
			if (!err.substr) {
				throw err; //it's already an object, let's kick it up the chain
			}
			if (isLocal()) {
				console.log(err);
			}
			if (err.substr(0, 4) == "MSG:") {
				error(err.substr(4, err.length), this, true);
			} else {
				error(err, this, true);
			}
		}

		if (typeof init == "boolean") {
			if (init) {
				init = new Material(1);
			} else {
				init = new Material(0);
			}
		}

		if (init instanceof Vector) {
			let d = this.dna;
			init.recurseApply(function (x) {
				if (d.nonNegative && x.value < 0) {
					x = new Material(0, d.units);
				}
				if (!x.units) {
					x.units = d.units;
				}
				return x;
			})
		} else {
			if (this.dna.nonNegative && init.value < 0) {
				init = new Material(0, this.dna.units);
			}
			if (!init.units) {
				init.units = this.dna.units;
			}
		}


		if (isUndefined(this.delay)) {
			// it's a non-serialized stock;
			this.level = init;
		} else {
			// it's serialized
			let startVal = mult(init, div(simulate.userTimeStep, this.delay))
			this.initRate = div(init, this.delay.forceUnits(simulate.timeUnits));

			this.level = startVal;

			simulate.tasks.addEvent((timeChange, oldTime, newTime) => {
				if (timeChange.value > 0) {
					if (lessThanEq(minus(newTime, simulate.timeStart), minus(this.delay, simulate.userTimeStep))) {
						timeChange = functionBank["min"]([timeChange, minus(this.delay, minus(oldTime, simulate.timeStart))]);
						this.level = plus(this.level, mult(timeChange, this.initRate));
					}
				}
			});
		}
	}

	subtract(amnt, time) {
		this.level = minus(this.level, amnt);
		if (this.dna.nonNegative) {
			if (this.level instanceof Vector) {
				let d = this.dna;
				this.level.recurseApply(function (x) {
					if (x.value < 0) {
						return new Material(0, d.units);
					} else {
						return x;
					}
				});
			} else if (this.level.value < 0) {
				this.level = new Material(0, this.dna.units);
			}
		}
	}

	add(amnt, time) {
		if (isUndefined(this.delay)) {
			this.level = plus(this.level, amnt);
			if (this.dna.nonNegative) {
				if (this.level instanceof Vector) {
					let d = this.dna;
					this.level.recurseApply(function (x) {
						if (x.value < 0) {
							return new Material(0, d.units);
						} else {
							return x;
						}
					});
				} else if (this.level.value < 0) {
					this.level = new Material(0, this.dna.units);
				}
			}
		} else {
			this.scheduleAdd(amnt, time);
		}
	}

	scheduleAdd(amnt, time, delay) {
		delay = delay || this.delay;

		let oldLevel;

		let me = this;
		let t = new Task({
			time: plus(time, delay),
			data: {
				amnt: amnt,
				tentative: true
			},
			priority: -100,
			name: "Conveyor Add (" + this.dna.name + ")",
			action: function () {
				oldLevel = me.level;
				me.level = plus(me.level, amnt);

				if (me.dna.nonNegative) {
					if (me.level instanceof Vector) {
						let d = me.dna;
						me.level.recurseApply(function (x) {
							if (x.value < 0) {
								return new Material(0, d.units);
							} else {
								return x;
							}
						});
					} else if (me.level.value < 0) {
						me.level = new Material(0, me.dna.units);
					}
				}
			},
			rollback: function () {
				me.level = oldLevel;
			}
		});
		this.tasks.push(t);
		simulate.tasks.add(t);
	}

	totalContents() {
		if (this.level === null) {
			this.setInitialValue();
		}

		if (isDefined(this.delay)) {
			let res = this.level;
			for (let i = 0; i < this.tasks.length; i++) {
				if (greaterThan(this.tasks[i].time, simulate.time()) && lessThanEq(this.tasks[i].time, plus(simulate.time(), this.delay))) {
					res = plus(res, this.tasks[i].data.amnt);
				}
			}

			let x = minus(this.delay, simulate.userTimeStep);
			if (greaterThan(x, simulate.timeProgressed())) {
				let timeLeft = minus(x, simulate.timeProgressed());
				res = plus(res, mult(this.initRate, timeLeft));
			}

			return res;
		} else {
			return this.level;
		}
	}

	calculateValue() {
		if (this.level === null) {
			this.setInitialValue();
		}
		if (isDefined(this.delay) && this.dna.solver.RKOrder == 4) {
			let res = this.level;
			for (let i = 0; i < this.tasks.length; i++) {
				if (greaterThan(this.tasks[i].time, simulate.time()) && lessThanEq(this.tasks[i].time, plus(simulate.time(), this.dna.solver.timeStep))) {
					res = plus(res, this.tasks[i].data.amnt);
				}
			}
			return res;
		} else {
			return this.level;
		}
	}
}

class Converter extends Primitive {
	constructor() {
		super();
		this.source = null;
		this.constructorFunction = Converter;
	}

	innerClone(p) { }

	setSource(source) {
		this.source = source;
	}

	getInputValue() {
		let inp;
		if (this.source == "*time") {
			inp = simulate.time();
		} else {
			inp = this.source.value().toNum();
			if (!inp) {
				error(getText("Undefined input value."), this, false);
			}
			if (inp instanceof Vector) {
				error(getText("Converters do not accept vectors as input values."), this, false);
			}
		}
		return inp;
	}

	calculateValue() {
		return new Material(this.getOutputValue().value, this.dna.units);
	}

	getOutputValue() {
		let inp = this.getInputValue();

		if (this.dna.inputs.length == 0) {
			return new Material(0);
		}
		for (let i = 0; i < this.dna.inputs.length; i++) {
			if (this.dna.interpolation == "discrete") {

				if (greaterThan(this.dna.inputs[i], inp)) {
					if (i == 0) {
						return this.dna.outputs[0];
					} else {
						return this.dna.outputs[i - 1];
					}
				}

			} else if (this.dna.interpolation == "linear") {
				if (eq(this.dna.inputs[i], inp)) {
					return this.dna.outputs[i];
				} else if (greaterThan(this.dna.inputs[i], inp)) {
					if (i == 0) {
						return this.dna.outputs[0];
					} else {
						let x = div(
							plus(
								mult(minus(inp, this.dna.inputs[i - 1]), this.dna.outputs[i]),
								mult(minus(this.dna.inputs[i], inp), this.dna.outputs[i - 1])
							),
							minus(this.dna.inputs[i], this.dna.inputs[i - 1]));
						return x;
					}
				}
			}
		}
		return this.dna.outputs[this.dna.outputs.length - 1];
	}
}


class Variable extends Primitive {
	constructor() {
		super();
		this.constructorFunction = Variable;
	}

	innerClone(p) { }

	calculateValue() {
		let x = evaluateTree(this.equation, globalVars(this));
		if (typeof x == "boolean") {
			if (x) {
				x = new Material(1);
			} else {
				x = new Material(0);
			}
		} else if (x instanceof Vector) {
			return x;
			//	error("Cannot set a variable value to a vector.", this, true)
		}
		if (!x.units) {
			x.units = this.dna.units;
		}
		
		return x;
	}
}


class Flow extends Primitive {
	constructor() {
		super();
		this.alpha = null;
		this.omega = null;
		this.rate = null;
		this.RKPrimary = [];
		this.constructorFunction = Flow;
	}

	innerClone(p) { }

	setEnds(alpha, omega) {
		this.alpha = alpha;
		this.omega = omega;
	}

	calculateValue() {
		this.predict();
		return this.rate.fullClone();
	}

	clean() {
		this.rate = null;
		this.RKPrimary = [];
	}

	predict(override) {
		if (this.rate === null || override) {
			let x;

			try {
				x = evaluateTree(this.equation, globalVars(this)).toNum();

				if (!((x instanceof Vector) || isFinite(x.value))) {
					throw ("MSG: " + getText("The result of this calculation is not finite. Flows must have finite values. Are you dividing by 0?"));
				}

			} catch (err) {
				if (!err.substr) {
					throw err; //it's already an object, let's kick it up the chain
				}
				if (isLocal()) {
					console.log(err);
				}
				if (err.substr(0, 4) == "MSG:") {
					error(err.substr(4, err.length), this, true);
				} else {
					error(err, this, true);
				}
			}
			if (typeof x == "boolean") {
				if (x) {
					x = new Material(1);
				} else {
					x = new Material(0);
				}
			}

			this.rate = x.fullClone();

			if (this.rate instanceof Vector) {
				let d = this.dna;
				this.rate.recurseApply(function (x) {
					if (!x.units) {
						x.units = d.units;
					}
					return x
				})
			} else if (!this.rate.units) {
				this.rate.units = this.dna.units;
			}

			this.testUnits(this.rate, true);

			this.rate = mult(this.rate, this.dna.solver.timeStep);

			if (override) {
				if (this.RKPrimary.length > 0) {
					this.RKPrimary[this.RKPrimary.length - 1] = this.rate;
				} else {
					this.RKPrimary.push(this.rate);
				}

			} else {
				this.RKPrimary.push(this.rate);
			}

			if (this.dna.solver.RKOrder == 4) {
				if (this.dna.solver.RKPosition == 1) {
					this.rate = this.RKPrimary[0];
				} else if (this.dna.solver.RKPosition == 2) {
					this.rate = this.RKPrimary[1];
				} else if (this.dna.solver.RKPosition == 3) {
					this.rate = this.RKPrimary[2];
				} else if (this.dna.solver.RKPosition == 4) {
					this.rate = div((plus(plus(plus(this.RKPrimary[0], mult(new Material(2), this.RKPrimary[1])), mult(new Material(2), this.RKPrimary[2])), this.RKPrimary[3])), new Material(6));
				}
			}

			this.rate = div(this.rate, this.dna.solver.timeStep);

			if (this.dna.onlyPositive) {
				if (this.rate instanceof Vector) {
					this.rate.recurseApply(function (x) {
						if (x.value >= 0) {
							return x
						} else {
							return new Material(0, x.units);
						}
					});
				} else {
					if (this.rate.value <= 0) {
						this.rate = new Material(0, this.rate.units);
					}
				}
			}



		}
	}

	apply(timeChange, oldTime, newTime) {

		try {

			if (this.rate === null) {
				return;
			}

			let rate = this.rate.fullClone();

			rate = mult(rate, timeChange);


			let in_rate = rate;
			let out_rate = rate;
			let collapsed = false;

			if (this.alpha !== null) {
				let v = this.alpha.level;
				if ((rate instanceof Vector) && ((!(v instanceof Vector)) || v.depth() < rate.depth())) {
					in_rate = rate.fullClone().collapseDimensions(v);
					collapsed = true;
				} else if ((v instanceof Vector) && ((!(rate instanceof Vector)) || v.depth() > rate.depth())) {
					error(getText("The alpha of the flow is a vector with a higher order than the flow rate. There has to be at least one element in the flow rate for each element in the alpha."), this, true)
				}
			}
			if (this.omega !== null) {
				let v = this.omega.level;
				if ((rate instanceof Vector) && ((!(v instanceof Vector)) || v.depth() < rate.depth())) {
					out_rate = rate.fullClone().collapseDimensions(v);
					collapsed = true;
				} else if ((v instanceof Vector) && ((!(rate instanceof Vector)) || v.depth() > rate.depth())) {
					error(getText("The omega of the flow is a vector with a higher order than the flow rate. There has to be at least one element in the flow rate for each element in the omega."), this, true)
				}
			}

			if (!collapsed) {

				if (this.omega !== null && this.omega.dna.nonNegative) {
					let modifier = plus(this.omega.level.toNum(), rate);
					if (modifier instanceof Vector) {
						modifier.recurseApply(function (x) {
							if (x.value < 0) {
								return x;
							} else {
								return new Material(0, x.units);
							}
						});
						rate = minus(rate, modifier);
					} else {
						if (modifier.value < 0) {
							rate = negate(this.omega.level.toNum());
						}
					}
				}

				if (this.alpha !== null && this.alpha.dna.nonNegative) {

					let modifier = minus(this.alpha.level.toNum(), rate);
					if (modifier instanceof Vector) {
						modifier.recurseApply(function (x) {
							if (x.value < 0) {
								return x;
							} else {
								return new Material(0, x.units);
							}
						})
						rate = minus(rate, modifier);
						rate = minus(rate, modifier);
					} else {
						if (modifier.value < 0) {
							rate = this.alpha.level.toNum();
						}
					}
				}

				if (this.omega !== null && this.omega.dna.nonNegative) {

					if (rate instanceof Vector) {
						let vec = functionBank["flatten"]([plus(this.omega.level.toNum(), rate)]);
						for (let i = 0; i < vec.items.length; i++) {
							if (vec.items[i].value < 0) {
								error(getText("Inconsistent non-negative constraints for flow."), this, false);
							}
						}
					} else {
						if (plus(this.omega.level.toNum(), rate).value < 0) {

							error(getText("Inconsistent non-negative constraints for flow."), this, false);
						}
					}
				}
			} else {
				if (this.alpha !== null && this.alpha.dna.nonNegative) {
					error(getText("Cannot use non-negative stocks when the flow rate is a vector that needs to be collapsed."), this.alpha, false);
				}
				if (this.omega !== null && this.omega.dna.nonNegative) {
					error(getText("Cannot use non-negative stocks when the flow rate is a vector that needs to be collapsed."), this.omega, false);
				}
			}

			let additionTest = 0;
			try {
				if (this.omega !== null) {
					additionTest = 1;
					if (collapsed) {
						this.omega.add(out_rate, oldTime);
					} else {
						this.omega.add(rate, oldTime);
					}
				}
				if (this.alpha !== null) {
					additionTest = 2;

					if (collapsed) {
						this.alpha.subtract(in_rate, oldTime);
					} else {
						this.alpha.subtract(rate, oldTime);
					}
				}
			} catch (err) {
				let stock = "";
				if (additionTest == 1) {
					stock = this.omega;
				} else if (additionTest == 2) {
					stock = this.alpha;
				}

				if (err == "MSG: Keys do not match for vector operation.") {
					error(getText("Incompatible vector keys for flow %s and connected stock %s.", "<i>[" + clean(this.dna.name) + "]</i>", "<i>[" + clean(stock.dna.name) + "]</i>"), this, false);
				} else {
					error(getText("Incompatible units for flow %s and connected stock %s. Stock has units of %s. The flow should have the equivalent units divided by some time unit such as Years.", "<i>[" + clean(this.dna.name) + "]</i>", "<i>[" + clean(stock.dna.name) + "]</i>", "<i>" + (stock.dna.units ? clean(stock.dna.units.toString()) : "unitless") + "</i>"), this, false);
				}

			}

		} catch (err) {
			if (!err.substr) {
				throw err; //it's already an object, let's kick it up the chain
			}
			if (err.substr(0, 4) == "MSG:") {
				error(err.substr(4, err.length), this, true);
			} else {
				error(err, this, true);
			}
		}
	}
}

function globalVars(primitive) {
	if (primitive instanceof Agent) {
		return { "-parent": varBank, "self": primitive };
	} else if (primitive.container) {
		return { "-parent": varBank, "self": primitive.container };
	} else {
		return varBank;
	}
}
