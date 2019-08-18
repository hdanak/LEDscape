export class BbbPinMappingInfo {
	sharedClockBank: number;

	pruIndex: number;
	pruPin: number;

	mappedChannelIndex: number;
	specialName: string;

	dataChannelIndex: number;
	clockChannelIndex: number;

	pruDataChannel: number;
	pruClockChannel: number;
}

function isNumeric(n: any) {
	return typeof(n) === "number" || parseFloat(n) == n;
}

export class BbbPinInfo extends BbbPinMappingInfo {
	public header: number;
	public headerPin: number;
	public gpioNum: number;
	public name: string;

	public gpioBank: number;
	public gpioBit: number;
	public gpioName: string;
	public gpioFullName: string;
	public headerName: string;

	public r30pru: number;
	public r30bit: number;

	public emmcPin: boolean;
	public bbbHdmiPin: boolean;

	constructor(data: {
		header: number
		headerPin: number
		gpioNum: number
		name: string,
		r30pru: number,
		r30bit: number,
		emmcPin?: boolean,
		bbbHdmiPin?: boolean
	}) {
		super();

		this.header = data.header;
		this.headerPin = data.headerPin;
		this.gpioNum = data.gpioNum;
		this.name = data.name;

		this.r30pru = data.r30pru;
		this.r30bit = data.r30bit;

		this.gpioBank = Math.floor(this.gpioNum / 32);
		this.gpioBit = this.gpioNum % 32;
		this.gpioName = this.gpioBank + "_" + this.gpioBit;
		this.gpioFullName = "GPIO" + this.gpioName;
		this.headerName = "P" + this.header + "_" + this.headerPin;

		this.emmcPin = !!data.emmcPin;
		this.bbbHdmiPin = !!data.bbbHdmiPin;
	}
}

export interface PinMappingData {
	id: string;
	name: string;
	description: string;
	dtbName?: string;
	maxChannelCount?: number;
	capeSupport: {
		org: string;
		id: string;
	}[];
	mappedPinNumberToPinDesignator: {
		[channelNumber: string]: string
	};
}

export class BbbPinIndex {
	pinsByHeaderAndPin: { [headerNum: number]: BbbPinInfo[] };
	pinsByGpioNum: { [gpioNum: number]: BbbPinInfo };
	pinsByGpioBankAndBit: { [gpioBank: number]: {[gpioBit: number]: BbbPinInfo} };
	pinsByName: { [name: string]: BbbPinInfo };
	pinsByGpioFullName: { [gpioFullName: string]: BbbPinInfo };
	pinsByHeaderName: { [headerName: string]: BbbPinInfo };

	/**
	 * Map of pins by the data channel it will output. This only exists after a PRU program assigns pins to itself.
	 */
	pinsByDataChannelIndex: { [dataChannelIndex: number]: BbbPinInfo };

	/**
	 * Map of pins by the clock channel it will output. This only exists after a PRU program assigns pins to itself,
	 * and only for those programs that use the data pins for clock signal.
	 */
	pinsByClockChannelIndex: { [clockChannelIndex: number]: BbbPinInfo };

	/**
	 * Map of pins by which PRU they are assigned to. This only exists after a PRU program assigns pins to itself.
	 */
	pinsByPruAndPin: { [pruNum: number]: BbbPinInfo[] };

	/**
	 * Map of pins by the channel number indicated in the mapping file.
	 */
	pinsByMappedChannelIndex: BbbPinInfo[];

	/**
	 * Map of pins that aren't used for indexed LED channel output, such as shared clock pins.
	 */
	pinsBySpecialName: BbbPinInfo[];

	constructor(public pinData: BbbPinInfo[]) {
		this.rebuild();
	}

	public rebuild() {
		this.pinsByHeaderAndPin = { 1: [], 2: [] };
		this.pinsByGpioNum = {};
		this.pinsByGpioBankAndBit = { 0: {}, 1: {}, 2: {}, 3: {} };
		this.pinsByName = {};
		this.pinsByGpioFullName = {};
		this.pinsByHeaderName = {};
		this.pinsByDataChannelIndex = {};
		this.pinsByClockChannelIndex = {};
		this.pinsByPruAndPin = { 0: [], 1: [] };
		this.pinsByMappedChannelIndex = [];
		this.pinsBySpecialName = [];

		pinData.forEach(pin => {
			this.pinsByHeaderAndPin[pin.header][pin.headerPin] = pin;
			this.pinsByGpioNum[pin.gpioNum] = pin;
			if (pin.gpioBank >= 0 && pin.gpioBit >= 0) {
				this.pinsByGpioBankAndBit[pin.gpioBank][pin.gpioBit] = pin;
			}
			this.pinsByName[pin.name] = pin;
			this.pinsByGpioFullName[pin.gpioFullName] = pin;
			this.pinsByHeaderName[pin.headerName] = pin;
			this.pinsByDataChannelIndex[pin.dataChannelIndex] = pin;
			this.pinsByClockChannelIndex[pin.clockChannelIndex] = pin;

			if (isNumeric(pin.pruIndex) && isNumeric(pin.pruPin)) {
				this.pinsByPruAndPin[pin.pruIndex][pin.pruPin] = pin;
			}

			if (isNumeric(pin.mappedChannelIndex)) {
				this.pinsByMappedChannelIndex[pin.mappedChannelIndex] = pin;
			}

			if (pin.specialName) {
				this.pinsBySpecialName[pin.specialName] = pin;
			}
		});
	}

	private resetPinPruMapping() {
		this.pinData.forEach(pin => {
			pin.pruClockChannel = undefined;
			pin.pruDataChannel = undefined;
			pin.pruIndex = undefined;
			pin.pruPin = undefined;
		});
	}

	public applyPerPruClockMapping(
		pinsPerPru
	) {
		this.resetPinPruMapping();

		var totalPinCount = pinsPerPru * 2;

		pinData.forEach(function(pin) {
			if (isNumeric(pin.mappedChannelIndex)) {
				pin.pruIndex = pin.mappedChannelIndex < 24 ? 0 : 1;
				var pruPin = pin.mappedChannelIndex - (pin.pruIndex * 24);

				if (pruPin < pinsPerPru) {
					pin.pruPin = pruPin;
					pin.pruDataChannel = pin.pruPin;

					if (pin.pruPin < pinsPerPru) {
						pin.dataChannelIndex = pin.pruIndex * pinsPerPru + pin.pruPin;
					}
				}
			} else if (pin.specialName) {
				var specialNameMatch = pin.specialName.match(/^clock(\d)$/);

				if (specialNameMatch) {
					pin.pruIndex = parseInt(specialNameMatch[1]);
				}
			}
		});

		this.rebuild();
	}

	public applyInterlacedClockPinMapping(
		pinsPerPru
	) {
		this.resetPinPruMapping();

		var totalPinCount = pinsPerPru * 2;

		pinData.forEach(function(pin) {
			if (pin.mappedChannelIndex < totalPinCount) {
				pin.pruIndex = pin.mappedChannelIndex < pinsPerPru ? 0 : 1;

				pin.pruPin = pin.mappedChannelIndex - (pin.pruIndex * pinsPerPru);

				if (pin.pruPin % 2 == 1) {
					// Data Pin
					pin.dataChannelIndex = Math.floor(pin.mappedChannelIndex / 2);
					pin.pruDataChannel = Math.floor(pin.pruPin / 2);
				} else {
					pin.clockChannelIndex = Math.floor(pin.mappedChannelIndex / 2);
					pin.pruClockChannel = Math.floor(pin.pruPin / 2);
				}
			}
		});

		this.rebuild();
	}

	public applySingleDataPinMapping(
		pinsPerPru
	) {
		this.resetPinPruMapping();

		pinData.forEach(function(pin) {
			if (pin.mappedChannelIndex < pinsPerPru*2) {
				pin.pruIndex = pin.mappedChannelIndex < pinsPerPru ? 0 : 1;
				pin.pruPin = pin.mappedChannelIndex - (pin.pruIndex * pinsPerPru);
				pin.pruDataChannel = pin.pruPin;

				if (pin.pruPin < pinsPerPru) {
					pin.dataChannelIndex = pin.pruIndex * pinsPerPru + pin.pruPin;
				}
			}
		});

		this.rebuild();
	}

	public applyR30PinMapping() {
		this.resetPinPruMapping();

		const pruPinCount = [0, 0];

		pinData.forEach(function(pin) {
			if (typeof(pin.r30pru) === "number" && typeof(pin.mappedChannelIndex) === "number") {
				pin.pruIndex = pin.r30pru;
				pin.pruPin = pruPinCount[pin.r30pru] ++;
				pin.pruDataChannel = pin.mappedChannelIndex;
				pin.dataChannelIndex = pin.mappedChannelIndex;
			}
		});

		this.rebuild();
	}

	public applyMappingData(
		pinMapping: PinMappingData
	) {
		var mappedCount = 0;

		var mappedPinNumberToPinDesignator = pinMapping.mappedPinNumberToPinDesignator;

		// Clear current mapping information
		pinData.forEach(pin => pin.mappedChannelIndex = undefined);

		for (var mappedName in mappedPinNumberToPinDesignator) if (mappedPinNumberToPinDesignator.hasOwnProperty(mappedName)) {
			var designator = ("" + pinMapping.mappedPinNumberToPinDesignator[mappedName]).toUpperCase().trim();
			var pin = this.pinsByHeaderName[designator] || this.pinsByName[designator] || this.pinsByGpioFullName[designator];

			if (pin) {

				if (parseInt(mappedName) as any == mappedName) {
					pin.mappedChannelIndex = parseInt(mappedName);
				} else {
					pin.specialName = mappedName;
				}

				if (console.debug) console.debug(`Mapped ${JSON.stringify(pin)} (found for ${designator}) to ${pin.mappedChannelIndex}`);
				mappedCount++;
			} else {
				throw new Error("No pin matches designator " + designator + " for pin " + mappedName);
			}
		}

		this.rebuild();
	}
}


// PRU GPIO mapping from http://elinux.org/Ti_AM33XX_PRUSSv2#Beaglebone_PRU_connections_and_modes
// eMMC and HDMI Pin Data from: https://www.mathworks.com/help/supportpkg/beaglebone/examples/pin-muxing.html
export var pinData = [
	new BbbPinInfo({ header: 1, headerPin:  2, name: "P1.02", gpioNum: 87,  r30pru: 1, r30bit: 9 }),
	new BbbPinInfo({ header: 1, headerPin:  4, name: "P1.04", gpioNum: 89,  r30pru: 1, r30bit: 11 }),
	new BbbPinInfo({ header: 1, headerPin: 29, name: "P1.29", gpioNum: 117, r30pru: 0, r30bit: 7 }),
	new BbbPinInfo({ header: 1, headerPin: 30, name: "P1.30", gpioNum: 43,  r30pru: 1, r30bit: 15 }),
	new BbbPinInfo({ header: 1, headerPin: 31, name: "P1.31", gpioNum: 114, r30pru: 0, r30bit: 4 }),
	new BbbPinInfo({ header: 1, headerPin: 32, name: "P1.32", gpioNum: 42,  r30pru: 1, r30bit: 14 }),
	new BbbPinInfo({ header: 1, headerPin: 33, name: "P1.33", gpioNum: 111, r30pru: 0, r30bit: 1 }),
	new BbbPinInfo({ header: 1, headerPin: 35, name: "P1.35", gpioNum: 88,  r30pru: 1, r30bit: 10 }),
	new BbbPinInfo({ header: 1, headerPin: 36, name: "P1.36", gpioNum: 110, r30pru: 0, r30bit: 0 }),
	new BbbPinInfo({ header: 2, headerPin: 24, name: "P2.24", gpioNum: 44,  r30pru: 0, r30bit: 14 }),
	new BbbPinInfo({ header: 2, headerPin: 28, name: "P2.28", gpioNum: 116, r30pru: 0, r30bit: 6 }),
	new BbbPinInfo({ header: 2, headerPin: 30, name: "P2.30", gpioNum: 113, r30pru: 0, r30bit: 3 }),
	new BbbPinInfo({ header: 2, headerPin: 32, name: "P2.32", gpioNum: 112, r30pru: 0, r30bit: 2 }),
	new BbbPinInfo({ header: 2, headerPin: 33, name: "P2.33", gpioNum: 45,  r30pru: 0, r30bit: 15 }),
	new BbbPinInfo({ header: 2, headerPin: 34, name: "P2.34", gpioNum: 115, r30pru: 0, r30bit: 5 }),
	new BbbPinInfo({ header: 2, headerPin: 35, name: "P2.35", gpioNum: 86,  r30pru: 1, r30bit: 8 }),
];
export var pinIndex = new BbbPinIndex(pinData);
