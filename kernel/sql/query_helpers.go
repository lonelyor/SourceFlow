package sql

import "strings"

func buildStringInClause(values []string) (string, []interface{}) {
	placeholders := make([]string, 0, len(values))
	args := make([]interface{}, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if "" == value {
			continue
		}
		placeholders = append(placeholders, "?")
		args = append(args, value)
	}
	return strings.Join(placeholders, ","), args
}

func buildStringNotInCondition(column string, values []string) (string, []interface{}) {
	placeholders, args := buildStringInClause(values)
	if "" == placeholders {
		return "", nil
	}
	return " AND " + column + " NOT IN (" + placeholders + ")", args
}
