import { describe, it, expect } from 'vitest'
import { parsePlayersCSV } from './import.service'

describe('parsePlayersCSV', () => {
  it('parses comma-separated rows', () => {
    const csv = 'Petrov,Ivan\nIvanova,Anna,Spartak'
    const result = parsePlayersCSV(csv)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ last_name: 'Petrov', first_name: 'Ivan', club: null, gender: null })
    expect(result[1]).toEqual({ last_name: 'Ivanova', first_name: 'Anna', club: 'Spartak', gender: null })
  })

  it('parses semicolon-separated rows', () => {
    const csv = 'Petrov;Ivan;Dynamo'
    const result = parsePlayersCSV(csv)
    expect(result[0]).toEqual({ last_name: 'Petrov', first_name: 'Ivan', club: 'Dynamo', gender: null })
  })

  it('skips english header row', () => {
    const csv = 'last_name,first_name,club\nPetrov,Ivan,Spartak'
    expect(parsePlayersCSV(csv)).toHaveLength(1)
  })

  it('skips russian header row', () => {
    const csv = 'Фамилия,Имя,Клуб\nПетров,Иван,Спартак'
    expect(parsePlayersCSV(csv)).toHaveLength(1)
  })

  it('skips empty lines', () => {
    const csv = 'Petrov,Ivan\n\nIvanova,Anna'
    expect(parsePlayersCSV(csv)).toHaveLength(2)
  })

  it('skips rows missing first_name or last_name', () => {
    const csv = ',Ivan\nPetrov,\nIvanova,Anna'
    expect(parsePlayersCSV(csv)).toHaveLength(1)
  })

  it('strips quotes from cells', () => {
    const csv = '"Petrov","Ivan","Spartak"'
    const result = parsePlayersCSV(csv)
    expect(result[0]).toEqual({ last_name: 'Petrov', first_name: 'Ivan', club: 'Spartak', gender: null })
  })

  it('returns empty array for empty content', () => {
    expect(parsePlayersCSV('')).toHaveLength(0)
    expect(parsePlayersCSV('\n\n')).toHaveLength(0)
  })

  it('treats empty club cell as null', () => {
    const csv = 'Petrov,Ivan,'
    expect(parsePlayersCSV(csv)[0].club).toBeNull()
  })
})
