import process from 'process'

export function attachFile(options: { filename: string, attachmentName: ?string, mimetype: ?string, toTest: ?boolean }) {
  tellReporter('allure:attachfile', options)
}

export function attachData(options: { data: any, attachmentName: string }) {
  tellReporter('allure:attachdata', options)
}

export function feature(features: string | Array<string>) {
  tellReporter('allure:feature', { features })
}

function startStep(label) {
  tellReporter('allure:startstep', { label })
}

function endStep(label, success = true) {
  tellReporter('allure:endstep', { status: success ? 'passed' : 'broken', label })
}

export function runStep(label, stepFn) {
  startStep(label)
  try {
    const result = stepFn()
    endStep(label)
    return result
  } catch (e) {
    endStep(label, false)
    throw e
  }
}

export async function runAsyncStep(label, stepFn) {
  startStep(label)
  try {
    const result = await stepFn()
    endStep(label)
    return result
  } catch (e) {
    endStep(label, false)
    throw e
  }
}

function tellReporter(event, msg = {}) {
  process.send({ event, ...msg })
}

export default {
  attachFile,
  attachData,
  feature,
  runStep,
  runAsyncStep
}
