/**
 * Optimistically update an event in the calendar before server confirmation
 * @param {Object} event - The calendar event to update
 * @param {Object} updateData - The new data to apply
 */
export function optimisticallyUpdateEvent(event, updateData) {
    if (!window.calendar || !event) return;
    
    // Store original data for rollback if needed
    const originalData = {
        start: event.start,
        end: event.end,
        title: event.title,
        backgroundColor: event.backgroundColor,
        borderColor: event.borderColor,
        textColor: event.textColor,
        extendedProps: { ...event.extendedProps }
    };
    
    // Apply updates optimistically
    if (updateData.start) {
        event.setStart(updateData.start);
    }
    if (updateData.end) {
        event.setEnd(updateData.end);
    }
    if (updateData.backgroundColor) {
        event.setProp('backgroundColor', updateData.backgroundColor);
        event.setProp('borderColor', updateData.backgroundColor);
    }
    if (updateData.comment !== undefined) {
        event.setExtendedProp('comment', updateData.comment);
    }
    
    // Store rollback data
    event._rollbackData = originalData;
    
    console.log('Applied optimistic update to event:', event.id);
    return originalData;
}

/**
 * Rollback an optimistic update if the server request fails
 * @param {string} eventId - The ID of the event to rollback
 */
export function rollbackOptimisticUpdate(eventId) {
    if (!window.calendar) return;
    
    const event = window.calendar.getEventById(eventId);
    if (!event || !event._rollbackData) return;
    
    const rollbackData = event._rollbackData;
    
    // Restore original values
    event.setStart(rollbackData.start);
    event.setEnd(rollbackData.end);
    event.setProp('backgroundColor', rollbackData.backgroundColor);
    event.setProp('borderColor', rollbackData.borderColor);
    if (rollbackData.textColor) {
        event.setProp('textColor', rollbackData.textColor);
    }
    
    // Restore extended props
    Object.keys(rollbackData.extendedProps).forEach(key => {
        event.setExtendedProp(key, rollbackData.extendedProps[key]);
    });
    
    // Clean up rollback data
    delete event._rollbackData;
    
    console.log('Rolled back optimistic update for event:', eventId);
}

/**
 * Confirm an optimistic update (clean up rollback data)
 * @param {string} eventId - The ID of the event to confirm
 */
export function confirmOptimisticUpdate(eventId) {
    if (!window.calendar) return;
    
    const event = window.calendar.getEventById(eventId);
    if (!event) return;
    
    // Clean up rollback data
    delete event._rollbackData;
    
    console.log('Confirmed optimistic update for event:', eventId);
}

/**
 * Preserve event data during calendar operations
 * @param {Object} event - The calendar event
 * @param {Object} newData - New data to merge
 */
export function preserveEventData(event, newData = {}) {
    if (!event || !event.extendedProps) {
        console.warn('Cannot preserve data for invalid event:', event);
        return;
    }
    
    // Ensure critical extended properties are preserved
    const preservedProps = {
        worklogId: event.extendedProps.worklogId,
        issueId: event.extendedProps.issueId,
        issueKey: event.extendedProps.issueKey,
        issueSummary: event.extendedProps.issueSummary,
        comment: event.extendedProps.comment || '',
        author: event.extendedProps.author,
        issueColor: event.extendedProps.issueColor || event.backgroundColor,
        issueType: event.extendedProps.issueType,
        issueTypeIcon: event.extendedProps.issueTypeIcon,
        ...newData
    };
    
    // Apply preserved properties and validate they exist
    Object.keys(preservedProps).forEach(key => {
        if (preservedProps[key] !== undefined && preservedProps[key] !== null) {
            event.setExtendedProp(key, preservedProps[key]);
        }
    });
    
    // Ensure color consistency between backgroundColor and issueColor
    const currentColor = event.backgroundColor || preservedProps.issueColor || '#2a75fe';
    if (currentColor) {
        event.setProp('backgroundColor', currentColor);
        event.setProp('borderColor', currentColor);
        event.setExtendedProp('issueColor', currentColor);
        
        // Ensure text visibility
        const textColor = currentColor === '#FFFFFF' || currentColor === '#ffffff' ? '#000000' : undefined;
        if (textColor) {
            event.setProp('textColor', textColor);
        }
    }
    
    // Validate critical properties exist
    const criticalProps = ['worklogId', 'issueId', 'issueKey'];
    const missingProps = criticalProps.filter(prop => !event.extendedProps[prop]);
    
    if (missingProps.length > 0) {
        console.error('Event missing critical properties after preservation:', missingProps, event.extendedProps);
    } else {
        console.log('Successfully preserved event data for:', event.id, {
            worklogId: event.extendedProps.worklogId,
            issueId: event.extendedProps.issueId,
            issueKey: event.extendedProps.issueKey,
            color: event.backgroundColor
        });
    }
    
    return preservedProps;
}

// Make functions globally available
window.optimisticallyUpdateEvent = optimisticallyUpdateEvent;
window.rollbackOptimisticUpdate = rollbackOptimisticUpdate;
window.confirmOptimisticUpdate = confirmOptimisticUpdate;
window.preserveEventData = preserveEventData;
