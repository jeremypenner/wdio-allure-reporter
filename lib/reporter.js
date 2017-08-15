import events from 'events'
import Allure from 'allure-js-commons'
import Step from 'allure-js-commons/beans/step'

function isEmpty (object) {
    return !object || Object.keys(object).length === 0
}

const LOGGING_HOOKS = ['"before all" hook', '"after all" hook']

/**
 * Initialize a new `Allure` test reporter.
 *
 * @param {Runner} runner
 * @api public
 */
class AllureReporter extends events.EventEmitter {
    constructor (baseReporter, config, options = {}) {
        super()

        this.baseReporter = baseReporter
        this.config = config
        this.options = options
        this.allures = {}
        this.postponedSteps = {}

        const { epilogue } = this.baseReporter

        this.on('end', () => {
            epilogue.call(baseReporter)
        })

        this.on('suite:start', (suite) => {
            const allure = this.getAllure(suite.cid)
            const currentSuite = allure.getCurrentSuite()
            const prefix = currentSuite ? currentSuite.name + ' ' : ''
            allure.startSuite(prefix + suite.title)
        })

        this.on('suite:end', (suite) => {
            this.getAllure(suite.cid).endSuite()
        })

        this.on('test:start', (test) => {
            const allure = this.getAllure(test.cid)
            allure.startCase(test.title)

            const currentTest = allure.getCurrentTest()
            currentTest.addParameter('environment-variable', 'capabilities', JSON.stringify(test.runner[test.cid]))
            currentTest.addParameter('environment-variable', 'spec files', JSON.stringify(test.specs))
        })

        this.on('test:pass', (test) => {
            this.getAllure(test.cid).endCase('passed')
        })

        this.on('test:fail', (test) => {
            const allure = this.getAllure(test.cid)
            const status = test.err.type === 'AssertionError' ? 'failed' : 'broken'

            if (!allure.getCurrentTest()) {
                allure.startCase(test.title)
            } else {
                allure.getCurrentTest().name = test.title
            }

            while (allure.getCurrentSuite().currentStep instanceof Step) {
                allure.endStep(status)
            }
            this.postponedSteps[test.cid] = []

            allure.endCase(status, test.err)
        })

        this.on('test:pending', (test) => {
            this.getAllure(test.cid).pendingCase(test.title)
        })

        this.on('runner:command', (command) => {
            const allure = this.getAllure(command.cid)

            if (!this.isAnyTestRunning(allure)) {
                return
            }

            allure.startStep(`${command.method} ${command.uri.path}`)

            if (!isEmpty(command.data)) {
                this.dumpJSON(allure, 'Request', command.data)
            }
        })

        this.on('runner:result', (command) => {
            const allure = this.getAllure(command.cid)

            if (!this.isAnyTestRunning(allure)) {
                return
            }

            if (command.requestOptions.uri.path.match(/\/wd\/hub\/session\/[^/]*\/screenshot/)) {
                allure.addAttachment('Screenshot', new Buffer(command.body.value, 'base64'))
            } else {
                this.dumpJSON(allure, 'Response', command.body)
            }

            const stepName = `${command.requestOptions.method || 'GET'} ${command.requestOptions.uri.path}`
            this.postponeOrEndStep(command.cid, stepName, 'passed')
        })

        this.on('hook:start', (hook) => {
            const allure = this.getAllure(hook.cid)

            if (!allure.getCurrentSuite() || LOGGING_HOOKS.indexOf(hook.title) === -1) {
                return
            }

            allure.startCase(hook.title)
        })

        this.on('hook:end', (hook) => {
            const allure = this.getAllure(hook.cid)

            if (!allure.getCurrentSuite() || LOGGING_HOOKS.indexOf(hook.title) === -1) {
                return
            }

            allure.endCase('passed')

            if (allure.getCurrentTest().steps.length === 0) {
                allure.getCurrentSuite().testcases.pop()
            }
            this.postponedSteps[hook.cid] = []
        })
    }

    getAllure (cid) {
        if (this.allures[cid]) {
            return this.allures[cid]
        }

        const allure = new Allure()
        allure.setOptions({ targetDir: this.options.outputDir || 'allure-results' })
        this.allures[cid] = allure
        this.postponedSteps[cid] = []
        return this.allures[cid]
    }

    isAnyTestRunning (allure) {
        return allure.getCurrentSuite() && allure.getCurrentTest()
    }

    postponeOrEndStep(cid, name, status) {
        const allure = this.getAllure(cid)
        const suite = allure.getCurrentSuite() || {}
        let step = suite.currentStep
        let postponed = this.postponedSteps[cid].slice()

        // In this loop:
        // We search for the expected step by name in the stack of active steps.
        // If it is found, that means we must either end all of the steps on the
        // stack up to that point, or we should postpone it.
        // If it is NOT found, that means we should ignore it; the step is not
        // active and does not need to be ended.
        let stepsToEnd = 0
        let shouldPostpone = false
        while (step instanceof Step) {
            stepsToEnd ++
            if (step.name === name) {
                if (!shouldPostpone) {
                    for (let stepCount = 0; stepCount < stepsToEnd; stepCount ++) {
                        allure.endStep(status)
                    }
                    this.postponedSteps[cid] = postponed
                } else {
                    this.postponedSteps[cid].push(name)
                }
                break
            }
            // We postpone ending the step if doing so would end a step which
            // we haven't yet postponed.
            const postponedIndex = postponed.indexOf(step.name)
            if (postponedIndex < 0) {
                shouldPostpone = true
            } else {
                postponed.splice(postponedIndex, 1)
            }
            step = step.parent
        }
    }

    dumpJSON (allure, name, json) {
        allure.addAttachment(name, JSON.stringify(json, null, '    '), 'application/json')
    }
}

export default AllureReporter