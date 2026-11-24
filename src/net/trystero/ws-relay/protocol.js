                                                                  

                                                        
                                      
                                        
                                                       

                                                          
               
                   
 

const isRecord = (value         )                                   =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isPayload = (value         )                     =>
  value === null ||
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean' ||
  Array.isArray(value) ||
  isRecord(value)

const isStrategyMessage = (value         )                           =>
  typeof value === 'string' || isRecord(value)

export const parseClientMessage = (
  raw        
)                              => {
  try {
    const msg = JSON.parse(raw)                                 

    if (!isRecord(msg) || typeof msg.topic !== 'string') {
      return null
    }

    if (msg.type === 'subscribe' || msg.type === 'unsubscribe') {
      return {type: msg.type, topic: msg.topic}
    }

    if (msg.type === 'publish' && isPayload(msg.payload)) {
      return {type: 'publish', topic: msg.topic, payload: msg.payload}
    }

    return null
  } catch {
    return null
  }
}

export const parseServerMessage = (
  data        
)                                               => {
  try {
    const msg = JSON.parse(data)            
                                           
     

    return typeof msg.topic === 'string' && isStrategyMessage(msg.payload)
      ? {topic: msg.topic, payload: msg.payload}
      : null
  } catch {
    return null
  }
}
