import { diffWords, diffJson } from 'diff'
import chalk from 'chalk'
import duplexer from 'duplexer'
import figures from 'figures'
import through2 from 'through2'
import parser from 'tap-parser'
import prettyMs from 'pretty-ms'
import jsondiffpatch from 'jsondiffpatch'
const Stringify = require('json-stable-stringify')

const stringify = (obj, _, space = 2) => Stringify(obj, { space })

const INDENT = '  '
const FIG_TICK = figures.tick
const FIG_CROSS = figures.cross

const toString = (arg) => Object.prototype.toString.call(arg).slice(8, -1).toLowerCase()

const JSONize = (str) => {
  return str
    // wrap keys without quote with valid double quote
    .replace(/([\$\w]+)\s*:/g, (_, $1) => '"' + $1 + '":')
    // replacing single quote wrapped ones to double quote
    .replace(/'([^']+)'/g, (_, $1) => '"' + $1 + '"')
}

const createReporter = () => {
  const output = through2()
  const p = parser()
  const stream = duplexer(p, output)
  const startedAt = Date.now()

  const println = (input = '', indentLevel = 0) => {
    let indent = ''

    for (let i = 0; i < indentLevel; ++i) {
      indent += INDENT
    }

    input.split('\n').forEach(line => {
      output.push(`${indent}${line}`)
      output.push('\n')
    })
  }

  const handleTest = name => {
    println()
    println(chalk.blue(name), 1)
  }

  const handleAssertSuccess = assert => {
    const name = assert.name

    println(`${chalk.green(FIG_TICK)}  ${chalk.dim(name)}`, 2)
  }

  const handleAssertFailure = assert => {
    const name = assert.name

    const writeDiff = ({ value, added, removed }) => {
      let style = chalk.white

      if (added) style = chalk.green.inverse
      if (removed) style = chalk.red.inverse

      // only highlight values and not spaces before
      return value.replace(/(^\s*)(.*)/g, (m, one, two) => one + style(two))
    }

    let {
      at,
      actual,
      expected
    } = assert.diag

    let expectedType = toString(expected, 2)

    if (expectedType !== 'array') {
      try {
        // the assert event only returns strings which is broken so this
        // handles converting strings into objects
        if (expected.indexOf('{') > -1) {
          actual = stringify(JSON.parse(JSONize(actual)), null, 2)
          expected = stringify(JSON.parse(JSONize(expected)), null, 2)
        }
      } catch (e) {
        try {
          actual = stringify(eval(`(${actual})`), null, 2)
          expected = stringify(eval(`(${expected})`), null, 2)
        } catch (e) {
          // do nothing because it wasn't a valid json object
        }
      }

      expectedType = toString(expected)
    }

    println(`${chalk.red(FIG_CROSS)}  ${chalk.red(name)} at ${chalk.magenta(at)}`, 2)

    if (expectedType === 'object') {
      // TODO check if this code is ever reached
      // ad failed_test_number is not defined!
      const delta = jsondiffpatch.diff(actual[failed_test_number], expected[failed_test_number])
      const output = jsondiffpatch.formatters.console.format(delta)
      println(output, 4)
    } else if (expectedType === 'array') {
      const compared = diffJson(actual, expected)
        .map(writeDiff)
        .join('')

      println(compared, 4)
    } else if (expected === 'undefined' && actual === 'undefined') {
      ;
    } else if (expectedType === 'string') {
      const compared = diffWords(actual, expected)
        .map(writeDiff)
        .join('')

      println(compared, 4)
    } else {
      println(
        chalk.red.inverse(actual) + chalk.green.inverse(expected),
        4
      )
    }
  }

  const handleComplete = result => {
    const finishedAt = Date.now()

    println()
    println(
      chalk.green(`passed: ${result.pass}  `) +
      chalk.red(`failed: ${result.fail || 0}  `) +
      chalk.white(`of ${result.count} tests  `) +
      chalk.dim(`(${prettyMs(finishedAt - startedAt)})`)
    )
    println()

    if (result.ok) {
      println(chalk.green(`All of ${result.count} tests passed!`))
    } else {
      println(chalk.red(`${result.fail || 0} of ${result.count} tests failed.`))
      stream.isFailed = true
    }

    println()
  }

  p.on('comment', (comment) => {
    const trimmed = comment.replace('# ', '').trim()

    if (/^tests\s+[0-9]+$/.test(trimmed)) return
    if (/^pass\s+[0-9]+$/.test(trimmed)) return
    if (/^fail\s+[0-9]+$/.test(trimmed)) return
    if (/^ok$/.test(trimmed)) return

    handleTest(trimmed)
  })

  p.on('assert', (assert) => {
    if (assert.ok) return handleAssertSuccess(assert)

    handleAssertFailure(assert)
  })

  p.on('complete', handleComplete)

  p.on('child', (child) => {
    ;
  })

  p.on('extra', extra => {
    println(chalk.yellow(`${extra}`.replace(/\n$/, '')), 4)
  })

  return stream
}

export default createReporter
